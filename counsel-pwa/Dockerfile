FROM node:22-alpine
# ffmpeg: ปรับความเร็วพูดของเสียง ElevenLabs (paxa.mjs) และตัดเสียงคลิป | yt-dlp: ดึงเสียง/คำบรรยายคลิปจากลิงก์ (links.mjs)
RUN apk add --no-cache ffmpeg yt-dlp
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
