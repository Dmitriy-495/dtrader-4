# Dockerfile for Trader Instance
# Instance C: Node.js трейдер (заглушка)

FROM node:18-alpine

# Устанавливаем зависимости
RUN apk add --no-cache python3 make g++

# Создаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package.json package-lock.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем исходный код
COPY src/ ./src/
COPY .env ./

# Компилируем TypeScript
RUN npm run build

# Устанавливаем nodemon для разработки
RUN npm install -g nodemon

# Порты
EXPOSE 3003

# Команда по умолчанию
CMD ["npm", "run", "start"]