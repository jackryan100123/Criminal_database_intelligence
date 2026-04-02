FROM node:20-alpine AS build
WORKDIR /app/frontend

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Vite reads VITE_* env at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

