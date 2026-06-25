# View Transition 主题切换（圆形扩散动画）

## 效果概述

点击主题切换按钮时，页面从点击位置以**圆形 clip-path 扩散**的方式从当前主题过渡到另一主题，而非简单的颜色跳变。该效果基于浏览器原生 **View Transition API**（`document.startViewTransition`）实现，在不支持该 API 的浏览器中自动降级为即时切换。

---

## 效果特点

| 特性 | 说明 |
|------|------|
| **圆形扩散动画** | 从用户点击位置向外扩散，视觉上像"揭开"新主题 |
| **基于 View Transition API** | 使用 `::view-transition-new(root)` 伪元素 + Web Animations API 驱动 |
| **优雅降级** | 不支持 `startViewTransition` 时直接切换，无报错 |
| **三种触发形态** | Index 页（单按钮）、Dashboard 页（Toggle 开关）、Admin 页（单按钮），各有独立过渡函数 |
| **CSS 变量驱动** | 主题色完全由 CSS 自定义属性控制，切换时仅修改 `body` class，无需逐元素操作 |
| **图标联动** | 切换时按钮图标在太阳/月亮之间变化，aria-label 同步更新 |
| **可调参数** | 动画时长、缓动函数均可在 JS 中调整 |

---

## 实现架构

整体分为三层：**CSS 变量层** → **HTML 触发层** → **JS 过渡层**

```
CSS 变量定义（:root / body.theme-dark）
        ↓
HTML 按钮触发（data-action="toggle-*-theme"）
        ↓
JS 过渡函数（runXxxThemeTransition → setTheme）
```

---

## 一、CSS 变量层

### 1. 浅色模式（默认）

在 `:root` 中定义全部设计 Token：

```css
:root {
  --canvas: #f7f7f4;
  --canvas-soft: #fafaf7;
  --surface: #ffffff;
  --surface-strong: #e6e5e0;
  --hairline: #e6e5e0;
  --hairline-strong: #cfcdc4;
  --ink: #26251e;
  --body: #5a5852;
  --muted: #807d72;
  --muted-soft: #a09c92;
  --primary: #f54e00;
  --primary-active: #d04200;
  --success: #1f8a65;
  --error: #cf2d56;
}
```

### 2. 深色模式

通过 `body.theme-dark` 覆盖同一组变量，所有引用变量的元素自动变色：

```css
body.theme-dark {
  --canvas: #1f1e1a;
  --canvas-soft: #262520;
  --surface: #2d2b25;
  --surface-strong: #38362f;
  --hairline: #3c3931;
  --hairline-strong: #575247;
  --ink: #f2efe6;
  --body: #c5c0b5;
  --muted: #a29b8b;
  --muted-soft: #817a6d;
}
```

### 3. View Transition 伪元素基础样式

禁用默认的淡入淡出动画，让自定义 clip-path 动画接管：

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
```

### 4. 主题切换按钮样式

#### 图标按钮（Index / Admin 页）

```css
.theme-icon-button {
  width: 56px;
  height: 56px;
  border: 1px solid var(--hairline);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  display: grid;
  place-items: center;
  color: var(--ink);
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease,
    color 180ms ease;
}

.theme-icon-button.is-active {
  border-color: var(--hairline-strong);
  background: var(--surface);
}

.theme-icon-button-single:hover {
  transform: translateY(-1px);
}

.theme-icon-button-single:active {
  transform: translateY(0) scale(0.98);
}
```

#### 太阳图标（纯 CSS 绘制）

```css
.theme-glyph {
  position: relative;
  display: block;
  width: 26px;
  height: 26px;
}

.theme-glyph-sun::before {
  content: "";
  position: absolute;
  inset: 6px;
  border: 2px solid currentColor;
  border-radius: 999px;
}

.theme-glyph-sun::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(currentColor, currentColor) center top / 2px 7px no-repeat,
    linear-gradient(currentColor, currentColor) center bottom / 2px 7px no-repeat,
    linear-gradient(currentColor, currentColor) left center / 7px 2px no-repeat,
    linear-gradient(currentColor, currentColor) right center / 7px 2px no-repeat,
    linear-gradient(45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%) left 3px top 3px / 7px 7px no-repeat,
    linear-gradient(45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%) right 3px bottom 3px / 7px 7px no-repeat,
    linear-gradient(-45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%) right 3px top 3px / 7px 7px no-repeat,
    linear-gradient(-45deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%) left 3px bottom 3px / 7px 7px no-repeat;
}
```

#### 月亮图标（纯 CSS 绘制）

```css
.theme-glyph-moon::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 4px;
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  border-radius: 999px;
}

.theme-glyph-moon::after {
  content: "";
  position: absolute;
  left: 14px;
  top: 2px;
  width: 16px;
  height: 24px;
  background: var(--surface);
  border-radius: 999px;
}
```

#### Toggle 开关按钮（Dashboard 页）

```css
.theme-switch {
  width: 48px;
  height: 26px;
  border-radius: 13px;
  background: #d7d4cc;
  cursor: pointer;
  position: relative;
}

.theme-switch::after {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  top: 2px;
  left: 2px;
  transition: transform 0.25s ease;
}

.theme-dark .theme-switch {
  background: var(--primary);
}

.theme-dark .theme-switch::after {
  transform: translateX(22px);
}
```

---

## 二、HTML 触发层

### Index 页按钮

```html
<button class="theme-icon-button theme-icon-button-single"
        type="button"
        data-action="toggle-index-theme"
        aria-label="切换主题">
  <span class="theme-glyph theme-glyph-sun" aria-hidden="true"></span>
</button>
```

### Admin 页按钮

```html
<button class="theme-icon-button theme-icon-button-single"
        type="button"
        data-action="toggle-admin-theme"
        aria-label="切换主题">
  <span class="theme-glyph theme-glyph-sun" aria-hidden="true"></span>
</button>
```

### Dashboard 页 Toggle 开关

```html
<button class="theme-switch"
        type="button"
        data-action="toggle-dashboard-theme"
        aria-label="切换主题"></button>
```

---

## 三、JS 过渡层

### 1. 核心状态切换函数 `setTheme`

```javascript
let currentTheme = "light";

function setTheme(theme) {
  currentTheme = theme;
  root.classList.toggle("dark", theme === "dark");
  body.classList.toggle("theme-dark", theme === "dark");
  body.classList.toggle("dark-theme", theme === "dark");
  root.style.colorScheme = theme === "dark" ? "dark" : "light";

  qsa(".theme-option").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === theme);
  });

  qsa(".theme-icon-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === theme);
  });

  qsa(".theme-icon-button-single").forEach((button) => {
    button.classList.add("is-active");
    const glyph = qs(".theme-glyph", button);
    if (!glyph) return;
    glyph.className = `theme-glyph ${theme === "dark" ? "theme-glyph-moon" : "theme-glyph-sun"}`;
    button.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
    button.setAttribute("title", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
  });
}
```

**关键操作：**
- 在 `<html>` 上切换 `dark` class（用于 `colorScheme`）
- 在 `<body>` 上切换 `theme-dark` / `dark-theme` class（用于 CSS 变量覆盖）
- 设置 `root.style.colorScheme` 让原生控件（滚动条等）跟随主题
- 更新图标：太阳 ↔ 月亮
- 更新无障碍标签

### 2. Index 页过渡函数 `runIndexThemeTransition`

```javascript
function runIndexThemeTransition(event) {
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  const clientX = event ? event.clientX : window.innerWidth - 48;
  const clientY = event ? event.clientY : 48;

  if (!document.startViewTransition) {
    setTheme(nextTheme);
    return;
  }

  const transition = document.startViewTransition(() => {
    setTheme(nextTheme);
  });

  const endRadius = Math.hypot(
    Math.max(clientX, window.innerWidth - clientX),
    Math.max(clientY, window.innerHeight - clientY)
  );

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${clientX}px ${clientY}px)`,
          `circle(${endRadius}px at ${clientX}px ${clientY}px)`
        ]
      },
      {
        duration: 1000,
        easing: "ease-in",
        fill: "both",
        pseudoElement: "::view-transition-new(root)"
      }
    );
  });
}
```

### 3. Dashboard 页过渡函数 `runDashboardThemeTransition`

```javascript
function runDashboardThemeTransition(switchEl) {
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  const rect = switchEl.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  if (!document.startViewTransition) {
    setTheme(nextTheme);
    return;
  }

  const transition = document.startViewTransition(() => {
    setTheme(nextTheme);
  });

  const endRadius = Math.hypot(
    Math.max(clientX, window.innerWidth - clientX),
    Math.max(clientY, window.innerHeight - clientY)
  );

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${clientX}px ${clientY}px)`,
          `circle(${endRadius}px at ${clientX}px ${clientY}px)`
        ]
      },
      {
        duration: 800,
        easing: "ease-in-out",
        fill: "both",
        pseudoElement: "::view-transition-new(root)"
      }
    );
  });
}
```

### 4. Admin 页过渡函数 `runAdminThemeTransition`

```javascript
function runAdminThemeTransition(event) {
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  const themeButton = event.target.closest('[data-action="toggle-admin-theme"]');
  let clientX, clientY;

  if (themeButton) {
    const rect = themeButton.getBoundingClientRect();
    clientX = rect.left + rect.width / 2;
    clientY = rect.top + rect.height / 2;
  } else {
    clientX = event ? event.clientX : window.innerWidth - 48;
    clientY = event ? event.clientY : 48;
  }

  if (!document.startViewTransition) {
    setTheme(nextTheme);
    return;
  }

  const transition = document.startViewTransition(() => {
    setTheme(nextTheme);
  });

  const endRadius = Math.hypot(
    Math.max(clientX, window.innerWidth - clientX),
    Math.max(clientY, window.innerHeight - clientY)
  );

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${clientX}px ${clientY}px)`,
          `circle(${endRadius}px at ${clientX}px ${clientY}px)`
        ]
      },
      {
        duration: 1000,
        easing: "ease-in",
        fill: "both",
        pseudoElement: "::view-transition-new(root)"
      }
    );
  });
}
```

### 5. 事件绑定

```javascript
// Index 页
function bindIndex() {
  document.addEventListener("click", (event) => {
    const themeButton = event.target.closest('[data-action="toggle-index-theme"]');
    if (themeButton) {
      runIndexThemeTransition(event);
    }
  });
}

// Dashboard 页（在 bindDashboard 内）
if (action === "toggle-dashboard-theme") {
  runDashboardThemeTransition(actionEl);
}

// Admin 页
const themeButton = event.target.closest('[data-action="toggle-admin-theme"]');
if (themeButton) {
  runAdminThemeTransition(event);
  return;
}
```

---

## 四、动画原理详解

### View Transition API 工作流程

```
用户点击 → startViewTransition(callback)
                ↓
     1. 浏览器截取当前页面快照（::view-transition-old）
                ↓
     2. 执行 callback（setTheme → DOM 变更）
                ↓
     3. 浏览器截取新页面快照（::view-transition-new）
                ↓
     4. transition.ready → 手动驱动 clip-path 动画
```

### 圆形扩散计算

```javascript
const endRadius = Math.hypot(
  Math.max(clientX, window.innerWidth - clientX),
  Math.max(clientY, window.innerHeight - clientY)
);
```

`endRadius` 的计算确保圆的半径足以覆盖从点击点到视口最远角的距离，保证扩散完成后整个页面都被新主题覆盖。

### clip-path 动画关键帧

```javascript
clipPath: [
  `circle(0px at ${clientX}px ${clientY}px)`,    // 起点：点击位置半径为 0
  `circle(${endRadius}px at ${clientX}px ${clientY}px)`  // 终点：覆盖全屏
]
```

动画应用在 `::view-transition-new(root)` 伪元素上，即新主题的快照层。旧快照层保持不动，新快照从点击位置以圆形逐渐展开覆盖。

---

## 五、复用指南

### 最小复用清单

将以下内容复制到新页面即可实现相同效果：

#### 必需 CSS

```css
/* 1. CSS 变量定义 */
:root {
  --canvas: #f7f7f4;
  --canvas-soft: #fafaf7;
  --surface: #ffffff;
  --surface-strong: #e6e5e0;
  --hairline: #e6e5e0;
  --hairline-strong: #cfcdc4;
  --ink: #26251e;
  --body: #5a5852;
  --muted: #807d72;
  --muted-soft: #a09c92;
  --primary: #f54e00;
  --primary-active: #d04200;
}

body.theme-dark {
  --canvas: #1f1e1a;
  --canvas-soft: #262520;
  --surface: #2d2b25;
  --surface-strong: #38362f;
  --hairline: #3c3931;
  --hairline-strong: #575247;
  --ink: #f2efe6;
  --body: #c5c0b5;
  --muted: #a29b8b;
  --muted-soft: #817a6d;
}

/* 2. View Transition 基础 */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

/* 3. 按钮 + 图标样式（按需选择图标按钮或 Toggle 开关） */
```

#### 必需 HTML

```html
<button class="theme-icon-button theme-icon-button-single"
        type="button"
        data-action="toggle-theme"
        aria-label="切换主题">
  <span class="theme-glyph theme-glyph-sun" aria-hidden="true"></span>
</button>
```

#### 必需 JS

```javascript
(function () {
  const body = document.body;
  const root = document.documentElement;
  let currentTheme = "light";

  function setTheme(theme) {
    currentTheme = theme;
    root.classList.toggle("dark", theme === "dark");
    body.classList.toggle("theme-dark", theme === "dark");
    root.style.colorScheme = theme === "dark" ? "dark" : "light";
    document.querySelectorAll(".theme-icon-button-single").forEach((button) => {
      const glyph = button.querySelector(".theme-glyph");
      if (!glyph) return;
      glyph.className = `theme-glyph ${theme === "dark" ? "theme-glyph-moon" : "theme-glyph-sun"}`;
      button.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
    });
  }

  function runThemeTransition(event) {
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    const clientX = event ? event.clientX : window.innerWidth - 48;
    const clientY = event ? event.clientY : 48;

    if (!document.startViewTransition) {
      setTheme(nextTheme);
      return;
    }

    const transition = document.startViewTransition(() => setTheme(nextTheme));
    const endRadius = Math.hypot(
      Math.max(clientX, window.innerWidth - clientX),
      Math.max(clientY, window.innerHeight - clientY)
    );

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${clientX}px ${clientY}px)`,
            `circle(${endRadius}px at ${clientX}px ${clientY}px)`
          ]
        },
        {
          duration: 800,
          easing: "ease-in-out",
          fill: "both",
          pseudoElement: "::view-transition-new(root)"
        }
      );
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="toggle-theme"]')) {
      runThemeTransition(event);
    }
  });
})();
```

### 可调参数

| 参数 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| `duration` | JS 过渡函数 | 800–1000ms | 扩散动画时长 |
| `easing` | JS 过渡函数 | `ease-in` / `ease-in-out` | 扩散缓动曲线 |
| CSS 变量值 | `:root` / `body.theme-dark` | 见上方 | 主题色板 |
| 按钮尺寸 | CSS `.theme-icon-button` | 56×56px | 图标按钮大小 |
| 按钮圆角 | CSS `.theme-icon-button` | 18px | 图标按钮圆角 |

### 浏览器兼容性

| 浏览器 | 支持情况 |
|--------|----------|
| Chrome 111+ | ✅ 完整支持 |
| Edge 111+ | ✅ 完整支持 |
| Safari 18+ | ✅ 完整支持 |
| Firefox | ⚠️ 不支持 View Transition API，自动降级为即时切换 |

---

## 六、注意事项

1. **`body` 上的 class 必须与 CSS 变量覆盖选择器一致**：CSS 中使用 `body.theme-dark` 覆盖变量，因此 JS 中必须给 `body` 添加 `theme-dark` class。
2. **`colorScheme` 设置**：`root.style.colorScheme = "dark"` 会让浏览器原生控件（滚动条、表单元素）跟随深色模式，不可遗漏。
3. **View Transition 与 `animation: none`**：必须将 `::view-transition-old(root)` 和 `::view-transition-new(root)` 的默认动画设为 `none`，否则自定义 clip-path 动画会被默认淡入淡出覆盖。
4. **`fill: "both"`**：Web Animations API 中必须设置 `fill: "both"`，确保动画结束后新主题快照保持在最终状态，不会回弹。
5. **深色模式下的页面级特殊样式**：部分页面（如 `.page-index`、`.page-dashboard`）有额外的深色模式覆盖样式，复用时需根据页面结构补充。
