export type ExecutiveDashboardState =
  | "LOADING"
  | "ERROR"
  | "EMPTY"
  | "HEALTHY"
  | "ATTENTION"
  | "CRITICAL";

type BackendDashboardState = Exclude<ExecutiveDashboardState, "LOADING" | "ERROR">;

export function resolveExecutiveDashboardState(input: {
  isLoading: boolean;
  isError: boolean;
  backendState?: BackendDashboardState;
}): ExecutiveDashboardState {
  if (input.isLoading) return "LOADING";
  if (input.isError || !input.backendState) return "ERROR";
  return input.backendState;
}

export const executiveDashboardStateLabel: Record<ExecutiveDashboardState, string> = {
  LOADING: "Carregando operação",
  ERROR: "Falha de leitura",
  EMPTY: "Sem dados operacionais",
  HEALTHY: "Operação saudável",
  ATTENTION: "Operação com atenção",
  CRITICAL: "Operação crítica",
};
