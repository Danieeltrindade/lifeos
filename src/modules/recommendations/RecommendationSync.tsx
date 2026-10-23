import { useRecommendationEngine } from './data/use-recommendation-engine';

/**
 * Componente sem interface: avalia as regras e sincroniza as recomendações ao abrir o
 * Dashboard (carregado sob demanda para não pesar o pacote inicial).
 */
export function RecommendationSync() {
  useRecommendationEngine({ sync: true });
  return null;
}
