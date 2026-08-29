import {
  Component,
  lazy,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { isChunkLoadError, withChunkLoadTimeout } from "@/lib/runtimeRecovery";

type ChunkBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type ChunkBoundaryState = {
  error: unknown;
};

export class DeferredFeatureChunkBoundary extends Component<ChunkBoundaryProps, ChunkBoundaryState> {
  state: ChunkBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ChunkBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (!isChunkLoadError(this.state.error)) throw this.state.error;
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function useDeferredFeature<Component extends ComponentType<any>>(
  load: () => Promise<{ default: Component }>,
) {
  const [attempt, setAttempt] = useState(0);
  const LazyComponent = useMemo(
    () => lazy(() => withChunkLoadTimeout(load)),
    [attempt, load],
  );
  return {
    attempt,
    Component: LazyComponent,
    retry: () => setAttempt((current) => current + 1),
  };
}
