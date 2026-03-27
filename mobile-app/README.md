# FXMark Mobile App (React Native + Expo)

Production-oriented starter blueprint for the FXMark mobile platform.

## Included foundations

- Expo + React Native + TypeScript
- React Navigation (stack + tabs)
- TanStack Query + Axios + Zod
- Zustand session store
- Theme tokens and dark/light support
- Reusable UI primitives for polished finance screens
- Hermes, inline requires, and EAS channels for bundle/update strategy

## Commands

```bash
npm install
npm run start
npm run typecheck
```

## Bundle and update strategy

- Hermes enabled in Expo config for better startup and runtime performance
- Metro `inlineRequires` enabled to reduce initial bundle work
- EAS channels configured: `development`, `staging`, `production`
- API base URL is environment-driven via `EXPO_PUBLIC_API_URL`

## Feature starter screens

- Auth (sign-in UI scaffold)
- Markets (top movers list)
- Portfolio (allocation cards + PnL)
