# Threat model

This page says what an attacker could try against PixelQ, what stops them, how that was checked, and what is not covered. It is meant to be honest, so the last section lists the gaps.

Last checked: 4 November 2026, on Node 26.13. Numbers come from [measurements.md](measurements.md). The design is in [architecture.md](architecture.md).

## Scope and assumptions

PixelQ is a self-hosted project for one machine. Its only published port is `127.0.0.1:8080`, so by default only programs on the same computer can reach it. There are no user accounts.

**What is protected:**

- The host machine (a bug in image handling should not give an attacker a way into it).
- The database and the stored files.
- The queue, so one client cannot stop everyone else from getting their images processed.

**Who is the attacker?**

1. Anyone who can reach the gateway. They can upload any file and send any request.
2. A malicious or broken dependency or base image (supply chain).

**Out of scope:** an attacker who already has a shell on the host, access to the Docker daemon, physical access, and anything about exposing the service to the public internet. The project has no TLS, no login and no abuse handling beyond what is listed here, so it should not be put on the public internet as it is.

## What each container can reach

| Container | Can talk to | Internet | Published to the host |
| --- | --- | --- | --- |
| gateway | api (over `frontend`) | Possible, see the note below | `127.0.0.1:8080` |
| api | postgres, redis (over `backend`) | **No** | No |
| worker | postgres, redis, api (over `backend`) | **No** | No |
| redis | nothing outside `backend` | No | No |
| postgres | nothing outside `backend` | No | No |

- **The api and worker cannot reach the internet.** `scripts/verify-hardening.sh` proves it on a running stack. A request to a public site fails with `EAI_AGAIN`, and the check first confirms that the container can reach postgres or the api, so a broken test cannot pass by accident. It also checks that the api is attached to internal networks only.
- **The gateway is the one exception.** Docker cannot publish a port from a container that is only on internal networks, so the gateway sits on the ordinary `edge` network as well. It runs a static Nginx configuration with no outbound features, but the hardening script does not check it.
- **The gateway cannot reach postgres or redis.** They are on a different network.
- **The optional development file** (`docker-compose.dev.yml`) publishes Postgres, Redis and the api on `127.0.0.1` and gives the api an ordinary network. Do not use it on a shared machine.

## Uploads: what an attacker can send and what stops it

| Attack | What stops it | How it was checked |
| --- | --- | --- |
| **A file that is not an image** (an executable or a text file with an image extension or content type) | The api reads the first bytes of the file and accepts only JPEG, PNG and WebP. The file name and the declared content type are ignored. | The smoke test uploads a text file and expects `415`. A text file declared as `image/jpeg` also got `415`. |
| **A file that is too large** | Nginx stops anything over 11 MB. The api enforces exactly 10 MB. | A 12 MB file got `413` from Nginx. A file of exactly 10 MB was accepted and one byte more was refused. |
| **A small file with enormous dimensions** (a "decompression bomb") | The worker opens the image with sharp and a limit of 50 million pixels, which is checked from the header before any decoding. | A 55.7 megapixel JPEG was refused in about 8 ms with "too many pixels", with no retry and no extra memory. |
| **The biggest allowed image** | The worker has a hard 512 MB memory limit, with swap set equal to it. | A 49 megapixel PNG used a peak of 181 MiB (baseline 44 MiB). The worker was not killed. |
| **Animated or multi-page images** | The worker rejects anything with more than one frame. | An animated WebP ends `failed` with a clear message (Phase 1 check). |
| **Odd file names** (path tricks like `../../x`) | The stored file name is a random UUID. The original name is only data and is cleaned before it is used in a download name. Paths read from the database are checked to be inside the upload or output folder before use. | An upload named `../../../tmp/pwned.jpg` was accepted, and the uploads folder holds only UUID file names. A download request with `..%2F..%2Fetc%2Fpasswd` as the variant got `400`. The path guard itself was read from the code and not attacked further. |
| **Hidden data in the image** (location in EXIF) | Outputs are new WebP files, and sharp drops metadata unless it is asked to keep it. | A JPEG with a marker text in its EXIF fields (Copyright and Artist) was uploaded. The marker was in the input and in none of the three outputs. GPS fields were not tested separately. |
| **Flooding the upload route** | Nginx allows 30 uploads per minute per client address, with a burst of 10, and answers `429` after that. Reads are not limited, so the page's polling keeps working. | Eleven fast uploads reached the api, and the 12th to 15th got `429`. Thirty health requests right after all got `200`. An upload 3 s later passed again. |
| **Scripts in page content** | The page is React (text is escaped). Nginx sends `Content-Security-Policy: default-src 'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. Downloads are served as `image/webp` with `nosniff`. | The download response was checked: `image/webp`, `attachment` with a clean file name, and `nosniff` (sent twice, once by the api and once by Nginx, which is harmless). The page itself was not attacked. |
| **Leaking details through errors** | Unexpected server errors return a generic message. Details go to the log only. Nginx hides its version (`server_tokens off`). Responses never contain server paths. | An unknown job id returns `{"error":"Job not found."}` and a malformed id returns a validation message. Neither contains a path. The generic 5xx message was read from the code. |

### If the decoder itself has a bug

The weakest point is the image library. A crafted file that triggers a bug in sharp or its bundled libraries is not something a size check can stop. PixelQ cannot prevent it, so it limits the damage. The worker, which is the process that opens untrusted files, runs with:

- no route to the internet,
- a read-only root filesystem (only `/tmp` and the `uploads` volume are writable),
- no Linux capabilities and `no-new-privileges`,
- a non-root user (uid 1000),
- memory and CPU limits.

The `scripts/verify-hardening.sh` script checks each of these on a running container. Keeping sharp up to date through dependency updates is the other half, and it is a manual step today.

## Supply chain

| Choice | Why |
| --- | --- |
| Slim base images (`node:26.13-slim`) and npm deleted from the api and worker runtime images | Fewer packages to attack and fewer findings in scans. npm is never run in production, and its bundled packages carried 10 of the HIGH findings in the first scan. |
| The gateway image is built in two stages: Node builds the page, and the final image is `nginx-unprivileged` with only the built files and the config | No Node, no source code and no package manager tools in the image that faces the user. |
| Dependency versions fixed by a lockfile, installed with `--frozen-lockfile` in the Dockerfiles and in CI | The build installs exactly what was reviewed. |
| pnpm blocks dependency install scripts unless they are listed | Only `esbuild` is allowed to run one. |
| Corepack is installed at a pinned version (0.36.0) in the build stages only | Node 26 no longer ships Corepack, and the version stays fixed. |
| Trivy scans all three images in CI and fails the build on any fixable HIGH or CRITICAL finding. It runs from a pinned container image (0.71.2), not from the GitHub Action. | The official action was compromised in March 2026 (its tags were rewritten), so the scanner is run from an image with a fixed version instead. |
| CI runs with a read-only token. A pull request must pass the `ci` check before it can be merged into `main`, and force pushes and deleting `main` are blocked. | A broken or unreviewed change cannot reach `main` quietly. |
| Images are pushed to ECR Public with GitHub OIDC and no stored keys. The role trusts only the `main` branch of this repository (both forms of the OIDC subject are listed). Its permissions are the five push actions on `pixelq-*` repositories and the two token actions. Images are tagged with the commit SHA only. | No long-lived secret can leak, and a pull request from a branch cannot publish images. The policies are in `infra/aws/`. |

**The scan gate works.** The first CI run found 3 fixable findings in the gateway image and 17 in each of the api and worker images. They were fixed by upgrading packages in the Dockerfiles. On 4 November 2026 the gate stopped a pull request again: two new HIGH findings in `libexpat` (Alpine) appeared in the vulnerability database, CI failed, and one added package name in the gateway Dockerfile fixed it.

## Known limitations

These are not hidden gaps. They are choices made for version 1, or things that were not measured.

**Uploads and storage**

- **Rejection happens late.** Animated and over-limit images are accepted at upload and rejected by the worker. Their files stay on disk until the cleanup job removes them. Rejecting at upload would need sharp inside the api image.
- **No disk quota.** The `uploads` volume has no size limit. At the allowed rate, one client could in theory write 30 files of 10 MB per minute (about 300 MB per minute, 18 GB per hour), and files are kept for 24 hours after a job finishes. Binding the gateway to `127.0.0.1` is the main protection.
- **Not tested:** the memory use of 16-bit PNG files and interlaced PNG files, which cannot be decoded as a stream. The worst case that was measured is an 8-bit PNG and a JPEG.

**Access**

- **No login and no TLS.** Every visitor sees the same latest 20 jobs. Job ids are random UUIDs, but anyone who has one can download its outputs.
- **The rate limit is per client address as Nginx sees it, and on this setup that is one address.** Nginx logs every local request as `172.21.0.1`, the Docker network gateway, not the real client. So the limit works as one shared limit for everything on the machine. There is no per-user limit.
- **The database password has a default** (`pixelq_dev`) unless `POSTGRES_PASSWORD` is set. The database is not published, but set a real password for anything beyond a local demo.

**Containers**

- **The gateway can open outbound connections** through the `edge` network (see above).
- **The hardening script covers the worker and the api.** The settings for the gateway, redis and postgres are in the compose file, but the script does not check them on a running stack.
- **The worker healthcheck** proves the process is alive, not that a job is progressing. Stuck jobs are handled by BullMQ's stalled-job check.

**Supply chain**

- **Pinning level.** Base images are pinned to a version tag, and GitHub, Docker and AWS actions to a major tag. None is pinned to a digest or a commit SHA. SHA and digest pinning with Dependabot is a later step.
- **Old OS updates can hide in the cache.** Cached build layers keep old `apt` and `apk` results until something earlier in the Dockerfile changes, so CI does not pick up new OS security updates by itself. A scheduled rebuild without cache would fix that, and it does not exist yet.
- **Temporary fixes remain** in the Dockerfiles (the `perl-base` upgrade and the removal of npm for api and worker, and the upgrade of `brotli-libs`, `curl`, `libcurl` and `libexpat` in the gateway). They should be removed when the base images ship the fixed versions.
- **The images on ECR Public are public**, and there is no automatic cleanup of old tags.

## How to check it yourself

```bash
docker compose up -d --wait
./scripts/smoke-test.sh          # upload, process, download, and a refused text file
./scripts/verify-hardening.sh    # seven checks on the worker and the api
./scripts/scan-images.sh         # Trivy scan of the three images (the first run downloads a database)
```
