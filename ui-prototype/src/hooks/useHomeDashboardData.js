import { useCallback, useEffect, useState } from "react";
import { dataProvider } from "../services/dataProvider";
import { getMockHomeDashboardData } from "../services/mockProvider";

export async function loadHomeDashboardData(provider = dataProvider) {
  return provider.getHomeDashboard();
}

export function useHomeDashboardData(provider = dataProvider) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    data: getMockHomeDashboardData(),
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    setState((current) => ({ ...current, loading: true, error: null }));

    loadHomeDashboardData(provider)
      .then((data) => {
        if (mounted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error) => {
        if (mounted) {
          setState((current) => ({ ...current, loading: false, error }));
        }
      });

    return () => {
      mounted = false;
    };
  }, [provider, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return { ...state, reload };
}
