# CrewOrCrook Frontend

This folder contains both client implementations for the CrewOrCrook backend:

- `mobile/`: React Native + Expo app for Android/iOS
- `web/`: Next.js web app for browser deployment

## Backend contract

The frontend apps are built to work with the current backend at:

- REST API: `http://localhost:5000`
- Socket.IO: `http://localhost:5000`

## Environment files

Copy the example file before running:

- `frontend/mobile/.env.example` -> `frontend/mobile/.env`
- `frontend/web/.env.example` -> `frontend/web/.env.local`

## Typical flow

1. Register or log in
2. Create a room or browse available rooms
3. Join the lobby over Socket.IO
4. Start the game as host or wait for auto-start
5. Move, kill, report bodies, vote, chat, and finish the match

## Run the apps

Mobile:

```bash
cd frontend/mobile
npm install
npm run start
```

Web:

```bash
cd frontend/web
npm install
npm run dev
```

## Deployment notes

- Set `EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` to the deployed backend URL
- Use secure cookies or token storage in production
- Ensure the backend CORS/origin policy allows your deployed frontend domains
