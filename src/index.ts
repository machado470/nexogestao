import { z } from "zod";

// Exemplo simples de validação usando Zod
const PingSchema = z.object({
  message: z.string().min(1)
});

// Função de exemplo que valida e retorna o objeto
export function ping(data: unknown) {
  const result = PingSchema.safeParse(data);
  if (!result.success) {
    // Em um projeto real, forneça mensagens de erro formatadas【79437274430533†L896-L899】
    throw new Error("Dados de ping inválidos");
  }
  return result.data;
}

console.log("Bem-vindo ao NexoGestão!", ping({ message: "ok" }));