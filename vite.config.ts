import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Build para servidor Node (preset node-server): roda em contêiner, VM da ATI-PE ou AWS (ECS, App Runner, EC2).
// No dev, o Vite não copia o .env para process.env; o servidor do SAPP lê dali.
Object.assign(process.env, { ...loadEnv("development", process.cwd(), ""), ...process.env });

export default defineConfig({
  server: { port: 3000 },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
    }),
    nitro({ preset: "vercel" }),,
    viteReact(),
  ],
});
