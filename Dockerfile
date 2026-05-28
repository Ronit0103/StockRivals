# Use Node.js alpine image for a lightweight container
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker's cache
COPY package*.json ./

# Install all dependencies (we need devDependencies as well since we build and use 'tsx' to run)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the client-side Vite application (creates the /app/dist folder)
RUN npm run build

# Set environment to production
ENV NODE_ENV=production

# Hugging Face Spaces defaults to exposing port 7860.
# The container must listen on port 7860.
ENV PORT=7860
EXPOSE 7860

# Start the full-stack server using our node/tsx setup
CMD ["npm", "start"]
