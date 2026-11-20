# Chat App Builder

Describe a web app in a chat and an AI model writes it as a single HTML page. Preview it at desktop or phone width, edit the code, go back to any version, and share it with a public link.

Inspired by https://onspace.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, list, rename and delete your own projects.
- Describe an app or a change in chat and get a working app back.
- Try the current app in a sandboxed preview at desktop or phone width.
- Edit the code by hand and save it as a new version.
- See every version, preview any of them and restore one.
- Publish any version at a public link, update it or take it down.

Left out: accounts and sign-in, which your Gateway handles; native mobile apps and store packaging; custom domains; databases, logins and payments inside generated apps; Figma, GitHub and other integrations; plans and credits; the community gallery.

## Setup

```sh
pnpm install
pnpm dev          # run locally behind the EveryApp dev launcher
pnpm test         # unit tests
pnpm run deploy   # deploy to your Gateway
```

There are no secrets or settings. Building uses your workspace's default AI model (`everyapp ai default`, or add a key with `everyapp provider add openrouter`). Without one, projects, code editing, versions and publishing still work, and sending a message says building is unavailable.

The checks in `checks/` run against a packaged release with a local stand-in for the AI model; a real model and a live deployment were not exercised.

## Limitations

- Generated apps are one HTML file with no backend: they run in a sandbox without cookies or local storage, so their data lasts only while the page is open.
- Projects are private to the member who made them; there is no sharing between members.
- A build waits for the model's whole answer, which can take a minute for larger apps.
