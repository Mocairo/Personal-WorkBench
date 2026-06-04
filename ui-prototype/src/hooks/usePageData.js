import { useCallback, useEffect, useState } from "react";
import { dataProvider } from "../services/dataProvider";
import {
  getMockAgentChatData,
  getMockAgentManagementData,
  getMockCodeRepositoryData,
  getMockIntelCenterData,
  getMockKnowledgeBaseData,
  getMockLocalMusicData,
  getMockSettingsData,
  getMockWidgetsData,
} from "../services/mockProvider";

function useProviderData(provider, loadData, initialData) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    data: initialData,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    setState((current) => ({ ...current, loading: true, error: null }));

    loadProviderDataWithFallback(provider, loadData, state.data)
      .then((nextState) => {
        if (mounted) {
          setState(nextState);
        }
      });

    return () => {
      mounted = false;
    };
  }, [provider, loadData, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return { ...state, reload };
}

export async function loadProviderDataWithFallback(provider, loadData, fallbackData) {
  try {
    return { data: await loadData(provider), loading: false, error: null };
  } catch (error) {
    return { data: fallbackData, loading: false, error };
  }
}

export async function loadAgentChatData(provider = dataProvider) {
  return provider.getAgentChat();
}

export function useAgentChatData(provider = dataProvider) {
  return useProviderData(provider, loadAgentChatData, getMockAgentChatData());
}

export async function loadKnowledgeBaseData(provider = dataProvider) {
  return provider.getKnowledgeBase();
}

export function useKnowledgeBaseData(provider = dataProvider) {
  return useProviderData(provider, loadKnowledgeBaseData, getMockKnowledgeBaseData());
}

export async function loadAgentManagementData(provider = dataProvider) {
  return provider.getAgentManagement();
}

export function useAgentManagementData(provider = dataProvider) {
  return useProviderData(provider, loadAgentManagementData, getMockAgentManagementData());
}

export async function loadCodeRepositoryData(provider = dataProvider) {
  return provider.getCodeRepository();
}

export function useCodeRepositoryData(provider = dataProvider) {
  return useProviderData(provider, loadCodeRepositoryData, getMockCodeRepositoryData());
}

export async function loadLocalMusicData(provider = dataProvider) {
  return provider.getLocalMusic();
}

export function useLocalMusicData(provider = dataProvider) {
  return useProviderData(provider, loadLocalMusicData, getMockLocalMusicData());
}

export async function loadIntelCenterData(provider = dataProvider) {
  return provider.getIntelCenter();
}

export function useIntelCenterData(provider = dataProvider) {
  return useProviderData(provider, loadIntelCenterData, getMockIntelCenterData());
}

export async function loadWidgetsData(provider = dataProvider) {
  return provider.getWidgets();
}

export function useWidgetsData(provider = dataProvider) {
  return useProviderData(provider, loadWidgetsData, getMockWidgetsData());
}

export async function loadSettingsData(provider = dataProvider) {
  return provider.getSettings();
}

export function useSettingsData(provider = dataProvider) {
  return useProviderData(provider, loadSettingsData, getMockSettingsData());
}

export async function selectSettingsSourcePath(provider = dataProvider, sourceId) {
  return provider.selectLocalSourcePath(sourceId);
}
