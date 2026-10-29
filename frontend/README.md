# Pixel Perfect Replay

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd741e6d-22a2-4157-85e1-edb0f67b624f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Document uploads in the client portal

Each portal step tells the orchestrator which document it expects (`?expected=id_card`, ...). The identity document is
accepted as a photo (JPG, PNG) or PDF, every other document as PDF only. The server reads the file before keeping it
and refuses one that is not the requested document, not a Romanian identity document, or not fully readable; the
portal shows its message ("Fotografia nu este clară ...") and the client uploads again.

Without the orchestrator nothing can read a file, so uploads are refused. `VITE_DEMO_UPLOADS=true` turns on the old
simulated checks for an offline demo (the tests set it in `vitest.config.ts`); never use it with real clients.

The face check needs https or localhost for the camera. When the face model (MediaPipe, from the CDN) cannot load, the
camera stays on and the client takes the photo manually; it is then marked for the officer to check.
