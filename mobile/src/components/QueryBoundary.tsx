import type { UseQueryResult } from '@tanstack/react-query';
import { PropsWithChildren, ReactNode } from 'react';

import { errorMessage, isApiError } from '@/api/errors';

import { EmptyState, ErrorState } from './StateViews';

interface Props {
  queries: UseQueryResult<unknown>[];
  skeleton: ReactNode;
}

/**
 * Loading / error / "offline and nothing cached" for screens fed by queries. Once ANY data exists (fresh or from
 * the persisted cache) the children render, even if a refetch failed: stale data beats an error screen.
 */
export function QueryBoundary({ queries, skeleton, children }: PropsWithChildren<Props>) {
  const retry = () => queries.forEach((q) => void q.refetch());
  const failed = queries.find((q) => q.isError && q.data === undefined);

  if (queries.some((q) => q.isPending && q.fetchStatus === 'paused')) {
    return (
      <EmptyState
        title="Sin conexión"
        message="Todavía no hay datos guardados en este teléfono. Conéctate para cargarlos."
      />
    );
  }
  if (failed) {
    const error = failed.error;
    return (
      <ErrorState
        message={isApiError(error) && error.isNetwork ? 'No se pudo contactar al servidor. Revisa tu conexión.' : errorMessage(error)}
        onRetry={retry}
      />
    );
  }
  if (queries.some((q) => q.isPending)) return <>{skeleton}</>;
  return <>{children}</>;
}
