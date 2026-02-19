<template>
  <div class="play-container">
    <!-- 背景层 -->
    <div class="layer-background">背景层</div>

    <!-- 立绘层：左 / 中 / 右 -->
    <div class="layer-characters">
      <div class="character character-left">立绘 · 左</div>
      <div class="character character-center">立绘 · 中</div>
      <div class="character character-right">立绘 · 右</div>
    </div>

    <!-- 顶部 UI 栏 -->
    <div class="layer-top-bar">
      <div class="top-btn">菜单</div>
      <div class="top-btn">回忆</div>
      <div class="top-btn">存档</div>
      <div class="top-btn">读档</div>
      <div class="top-btn">设置</div>
    </div>

    <!-- 对话框层 -->
    <div class="layer-dialogue">
      <div class="dialogue-name">角色名</div>
      <div class="dialogue-text">对话内容区域</div>
      <div class="dialogue-controls">
        <div class="ctrl-btn">自动</div>
        <div class="ctrl-btn">快进</div>
        <div class="ctrl-btn">历史</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.play-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111;
}

/* ===== 背景层 ===== */
.layer-background {
  position: absolute;
  inset: 0;
  background: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.3);
  z-index: 0;
}

/* ===== 立绘层 ===== */
.layer-characters {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 5%;
  z-index: 1;
  pointer-events: none;
}

.character {
  width: 22%;
  height: 70%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 8px 8px 0 0;
  border: 2px dashed rgba(255, 255, 255, 0.2);
}

.character-left {
  background: rgba(52, 152, 219, 0.25);
}

.character-center {
  background: rgba(155, 89, 182, 0.25);
  width: 26%;
  height: 80%;
}

.character-right {
  background: rgba(231, 76, 60, 0.25);
}

/* ===== 顶部 UI 栏 ===== */
.layer-top-bar {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  z-index: 10;
}

.top-btn {
  padding: 6px 18px;
  background: rgba(236, 201, 75, 0.35);
  color: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid rgba(236, 201, 75, 0.5);
}

/* ===== 对话框层 ===== */
.layer-dialogue {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30%;
  background: rgba(44, 62, 80, 0.85);
  border-top: 3px solid rgba(52, 152, 219, 0.6);
  padding: 20px 40px;
  display: flex;
  flex-direction: column;
  z-index: 5;
}

.dialogue-name {
  width: fit-content;
  padding: 4px 24px;
  margin-bottom: 10px;
  background: rgba(46, 204, 113, 0.35);
  color: rgba(255, 255, 255, 0.85);
  font-size: 18px;
  font-weight: bold;
  border-radius: 4px;
  border: 1px solid rgba(46, 204, 113, 0.5);
}

.dialogue-text {
  flex: 1;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  line-height: 1.8;
  border-radius: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
}

.dialogue-controls {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

.ctrl-btn {
  padding: 4px 16px;
  background: rgba(230, 126, 34, 0.35);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid rgba(230, 126, 34, 0.5);
}
</style>
