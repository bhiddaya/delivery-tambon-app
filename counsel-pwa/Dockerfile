FROM node:22-alpine
# ffmpeg: ปรับความเร็วพูดของเสียง ElevenLabs (src/paxa.mjs changeTempo)
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
