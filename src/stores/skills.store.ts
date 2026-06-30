import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SkillInfo, SkillMarketItemInfo, SkillRefResolutionInfo } from '@/types/global'

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<SkillInfo[]>([])
  const marketItems = ref<SkillMarketItemInfo[]>([])
  const loading = ref(false)

  async function loadSkills(): Promise<void> {
    if (!window.tiex?.skills) return
    skills.value = await window.tiex.skills.list()
  }

  async function scanSkills(): Promise<void> {
    if (!window.tiex?.skills) return
    loading.value = true
    try {
      skills.value = await window.tiex.skills.scan()
    } finally {
      loading.value = false
    }
  }

  async function loadMarket(): Promise<void> {
    if (!window.tiex?.skills) return
    marketItems.value = await window.tiex.skills.getMarket()
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    if (!window.tiex?.skills) return
    await window.tiex.skills.setEnabled(id, enabled)
    await loadSkills()
    await loadMarket()
  }

  async function deleteSkill(id: string): Promise<void> {
    if (!window.tiex?.skills) return
    await window.tiex.skills.delete(id)
    await loadSkills()
    await loadMarket()
  }

  async function installMarket(id: string): Promise<void> {
    if (!window.tiex?.skills) return
    await window.tiex.skills.installMarket(id)
    await loadSkills()
    await loadMarket()
  }

  async function importCodexSkills(): Promise<void> {
    if (!window.tiex?.skills) return
    loading.value = true
    try {
      skills.value = await window.tiex.skills.importCodex()
      await loadMarket()
    } finally {
      loading.value = false
    }
  }

  async function openFolder(): Promise<void> {
    if (!window.tiex?.skills) return
    await window.tiex.skills.openFolder()
  }

  async function resolveRefs(content: string): Promise<SkillRefResolutionInfo> {
    if (!window.tiex?.skills) return { refs: [], missing: [], disabled: [] }
    return window.tiex.skills.resolveRefs(content)
  }

  return {
    skills,
    marketItems,
    loading,
    loadSkills,
    scanSkills,
    loadMarket,
    setEnabled,
    deleteSkill,
    installMarket,
    importCodexSkills,
    openFolder,
    resolveRefs,
  }
})
