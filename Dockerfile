FROM node:20-alpine

WORKDIR /app

# Instala as dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./
RUN npm ci --only=production

# Copia o restante dos arquivos do projeto
COPY . .

# Expõe a porta que o servidor utiliza
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["npm", "start"]
