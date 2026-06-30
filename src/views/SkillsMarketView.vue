<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Download, RefreshCw, Wrench } from 'lucide-vue-next'
import { useSkillsStore } from '@/stores/skills.store'
import {
  SKILL_MARKET_CATEGORIES,
  normalizeSkillMarketCategory,
  skillMatchesCategory,
} from '@/constants/skill-market'

const skillsStore = useSkillsStore()
const route = useRoute()

const activeCategory = computed(() => normalizeSkillMarketCategory(route.query.category))
const activeCategoryMeta = computed(() => {
  return SKILL_MARKET_CATEGORIES.find((item) => item.id === activeCategory.value) ?? SKILL_MARKET_CATEGORIES[0]
})
const filteredMarketItems = computed(() => {
  return skillsStore.marketItems.filter((item) => skillMatchesCategory(item, activeCategory.value))
})

onMounted(async () => {
  await skillsStore.loadSkills()
  await skillsStore.loadMarket()
})
</script>

<template>
  <div class="skills-market-page">
    <div class="skills-market-container">
      <div class="market-head">
        <div>
          <div class="market-kicker">TieX Skills</div>
          <h2>Skills 市场</h2>
          <div class="market-filter-pill">{{ activeCategoryMeta.label }}</div>
          <p>安装本地内置 Skills，在对话里用 <code>$skillName</code> 引用后，TieX 会把对应工作方法注入本轮上下文。</p>
        </div>
        <button class="secondary-btn" @click="skillsStore.loadMarket">
          <RefreshCw :size="14" />
          刷新
        </button>
      </div>

      <div class="market-grid">
        <article v-for="item in filteredMarketItems" :key="item.id" class="market-card">
          <div class="market-card-icon">
            <Wrench :size="18" />
          </div>
          <div class="market-card-main">
            <div class="market-title-row">
              <h3>{{ item.displayName }}</h3>
              <span v-if="item.installedSkillId" class="installed-pill">已安装</span>
            </div>
            <div class="market-name">${{ item.name }}</div>
            <p>{{ item.description }}</p>
            <div class="market-tags">
              <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
            </div>
          </div>
          <button
            class="send-btn market-install"
            :disabled="!!item.installedSkillId"
            @click="skillsStore.installMarket(item.id)"
          >
            <Download :size="14" />
            {{ item.installedSkillId ? '已安装' : '安装' }}
          </button>
        </article>
      </div>
      <div v-if="filteredMarketItems.length === 0" class="market-empty">
        这一类暂时没有可安装的 Skill。
      </div>
    </div>
  </div>
</template>

<style scoped>
.skills-market-page {
  height: 100%;
  overflow-y: auto;
  padding: 34px 26px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--topbar-bg) 36%, transparent), transparent 132px),
    var(--bg);
}

.skills-market-container {
  width: min(980px, 100%);
  margin: 0 auto;
}

.market-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.market-kicker {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.market-head h2 {
  margin: 6px 0 8px;
  color: var(--text-strong);
  font-size: 26px;
}

.market-filter-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  margin-bottom: 10px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.market-head p {
  margin: 0;
  max-width: 680px;
  color: var(--muted);
  line-height: 1.65;
}

.market-head code {
  color: var(--accent);
}

.market-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.market-card {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  min-height: 210px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.market-card-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
}

.market-card-main {
  min-width: 0;
}

.market-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.market-title-row h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: 15px;
}

.installed-pill {
  border-radius: 999px;
  padding: 3px 7px;
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success-strong);
  font-size: 11px;
  font-weight: 700;
}

.market-name {
  margin-top: 6px;
  color: var(--sidebar-text-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
}

.market-card p {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.market-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.market-tags span {
  padding: 4px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}

.market-install {
  grid-column: 1 / -1;
  justify-self: end;
  min-height: 34px;
}

.market-install:disabled {
  opacity: 0.62;
  cursor: default;
}

.market-empty {
  margin-top: 18px;
  padding: 22px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  color: var(--muted);
  text-align: center;
}

@media (max-width: 1180px) {
  .market-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .market-grid {
    grid-template-columns: 1fr;
  }
}
</style>
