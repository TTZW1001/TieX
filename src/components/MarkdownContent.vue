<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/app.store'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  content: string
}>()

const appStore = useAppStore()
const renderedHtml = ref('')

watch(
  () => [props.content, appStore.isDark] as const,
  async ([content, isDark]) => {
    renderedHtml.value = await renderMarkdown(content ?? '', isDark ? 'dark' : 'light')
  },
  { immediate: true }
)
</script>

<template>
  <div class="markdown-body" v-html="renderedHtml" />
</template>
