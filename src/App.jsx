
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Play, Download, Trash2, Video, Settings, X, Check,
  Smile, Eye, EyeOff, Wind, MoveLeft, MoveRight, ArrowDown, RefreshCw, Zap,
  Globe, Terminal, Edit3, Save, MessageSquare, CloudRain, Snowflake, Activity,
  ChevronDown, ChevronRight, Image as ImageIcon, Heart, Hash, Sun, Moon,
  Camera, Film, Sparkles, User, Palette, Layers, Minimize2, Maximize2, Monitor,
  KeyRound, LogOut, Coins, Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './index.css';

const TOKEN_KEY = 'pengip_token';
const API_BASE = '/motionx/api';

// --- Configuration & Data ---
const TEXTS = {
  en: {
    history: "History",
    noHistory: "No history yet",
    uploadTitle: "Upload Portrait",
    uploadDesc: "Drag & drop high-quality portrait",
    uploadTip: "💡 Tip: For precise results, use reference images - one image is worth a thousand words!",
    preview: "Preview",
    duration: "Duration",
    aspectRatio: "Aspect Ratio",
    motionPresets: "Motion Presets",
    selectActions: "Select Actions",
    generate: "Generate Motion",
    generating: "Synthesizing...",
    promptLabel: "Prompt Engineering (Editable)",
    consoleTitle: "Generation Log",
    clear: "Clear",
    download: "Download",
    play: "Play",
    uploadBtn: "Select File",
    customInputPlaceholder: "Describe custom action...",
    activateTitle: "Activate MicroMotion",
    activateDesc: "Enter your activation code to get started",
    activateCode: "Activation Code",
    activateBtn: "Activate",
    activating: "Activating...",
    balance: "Credits",
    logout: "Logout",
    generateWarning: "⚠️ Generation takes time, please don't close or refresh the page",
    downloadWarning: "⚠️ Download immediately - videos are stored for 7 days only",
    categories: {
      Head: "Head Pose",
      Expression: "Expression",
      Eyes: "Eye Movement",
      Mouth: "Mouth & Speech",
      Ambient: "Ambient & Vibe",
      Camera: "Camera Movement"
    },
    ratios: {
      "16:9": "Cinematic (16:9)",
      "9:16": "Portrait (9:16)",
      "1:1": "Square (1:1)",
      "3:4": "Portrait (3:4)",
    }
  },
  zh: {
    history: "历史记录",
    noHistory: "暂无记录",
    uploadTitle: "上传人物肖像",
    uploadDesc: "拖拽或点击上传高清图片",
    uploadTip: "💡 提示：生图类应用，如果需要很精准，最好多垫图，一张图胜过千万语言！",
    preview: "预览",
    duration: "视频时长",
    aspectRatio: "视频画幅",
    motionPresets: "动作预设",
    selectActions: "选择动作 (可多选)",
    generate: "开始生成",
    generating: "AI 合成中...",
    promptLabel: "提示词工程 (可编辑)",
    consoleTitle: "任务日志",
    clear: "清空",
    download: "下载",
    play: "播放",
    uploadBtn: "选择文件",
    customInputPlaceholder: "描述自定义动作...",
    activateTitle: "激活 MicroMotion",
    activateDesc: "输入激活码开始使用，每次生成消耗 50 积分",
    activateCode: "激活码",
    activateBtn: "立即激活",
    activating: "激活中...",
    balance: "积分",
    logout: "退出",
    generateWarning: "⚠️ 生成需要较长时间，请勿关闭或刷新页面",
    downloadWarning: "⚠️ 请及时下载，视频仅保存7天",
    categories: {
      Head: "头部姿态",
      Expression: "面部表情",
      Eyes: "眼部动作",
      Mouth: "嘴部与说话",
      Ambient: "环境与氛围",
      Camera: "运镜方式"
    },
    ratios: {
      "16:9": "宽屏电影 (16:9)",
      "9:16": "抖音/TikTok (9:16)",
      "1:1": "正方形 (1:1)",
      "3:4": "小红书 (3:4)",
    }
  }
};

const label = (en, zh) => ({ en, zh });

const ACTIONS_DATA = {
  Head: [
    { id: 'h1', label: label('Tilt Left', '向左偏头'), icon: MoveLeft },
    { id: 'h2', label: label('Tilt Right', '向右偏头'), icon: MoveRight },
    { id: 'h3', label: label('Look Up', '微微抬头'), icon: ArrowDown, rotate: 180 },
    { id: 'h4', label: label('Look Down', '低头害羞'), icon: ArrowDown },
    { id: 'h5', label: label('Slow Nod', '缓慢点头'), icon: Check },
    { id: 'h6', label: label('Gentle Shake', '轻微摇头'), icon: RefreshCw },
    { id: 'h7', label: label('Turn Left', '左转头'), icon: MoveLeft },
    { id: 'h8', label: label('Turn Right', '右转头'), icon: MoveRight },
    { id: 'h9', label: label('Neck Stretch', '颈部舒展'), icon: Activity },
    { id: 'h10', label: label('Head Bob (Music)', '随音乐律动'), icon: Activity },
    { id: 'custom_head', label: label('Custom Head Motion', '自定义头部动作'), icon: Edit3, isCustom: true },
  ],
  Expression: [
    { id: 'e1', label: label('Soft Smile', '温柔微笑'), icon: Smile },
    { id: 'e2', label: label('Big Laugh', '开怀大笑'), icon: Smile },
    { id: 'e3', label: label('Serious', '严肃凝视'), icon: Activity },
    { id: 'e4', label: label('Surprised', '惊讶/张嘴'), icon: Zap },
    { id: 'e5', label: label('Sad/Melancholy', '忧伤/快哭了'), icon: CloudRain },
    { id: 'e6', label: label('Pouty', '生气/嘟嘴'), icon: Hash },
    { id: 'e7', label: label('Flirty', '挑逗/魅惑'), icon: Heart },
    { id: 'e8', label: label('Disgusted', '厌恶/皱眉'), icon: X },
    { id: 'e9', label: label('Fearful', '恐惧/瞪眼'), icon: Eye },
    { id: 'e10', label: label('Confused', '困惑/歪嘴'), icon: RefreshCw },
    { id: 'custom_expr', label: label('Custom Expression', '自定义表情'), icon: Edit3, isCustom: true },
  ],
  Eyes: [
    { id: 'y1', label: label('Natural Blink', '自然眨眼'), icon: Eye },
    { id: 'y2', label: label('Wink Left', '左眼眨眼'), icon: EyeOff },
    { id: 'y3', label: label('Wink Right', '右眼眨眼'), icon: EyeOff },
    { id: 'y4', label: label('Roll Eyes', '翻白眼'), icon: RefreshCw },
    { id: 'y5', label: label('Look Around', '眼神流转'), icon: Eye },
    { id: 'y6', label: label('Squint', '眯眼/看清'), icon: Minimize2 },
    { id: 'y7', label: label('Wide Open', '瞪大眼睛'), icon: Maximize2 },
    { id: 'y8', label: label('Crying', '流泪'), icon: CloudRain },
    { id: 'y9', label: label('Sleepy', '困倦/眼皮打架'), icon: Moon },
    { id: 'y10', label: label('Sparkle Eyes', '星星眼'), icon: Sparkles },
    { id: 'custom_eyes', label: label('Custom Eye Motion', '自定义眼部动作'), icon: Edit3, isCustom: true },
  ],
  Ambient: [
    { id: 'a1', label: label('Breathing', '呼吸感 (胸腔起伏)'), icon: Wind },
    { id: 'a2', label: label('Wind in Hair', '微风拂发'), icon: Wind },
    { id: 'a3', label: label('Rainy Mood', '雨天氛围'), icon: CloudRain },
    { id: 'a4', label: label('Snowing', '雪花飘落'), icon: Snowflake },
    { id: 'a5', label: label('Neon Glitch', '赛博故障效果'), icon: Zap },
    { id: 'a6', label: label('Sunlight Shift', '阳光光影变化'), icon: Sun },
    { id: 'a7', label: label('Cinematic Blur', '电影级背景虚化'), icon: Film },
    { id: 'a8', label: label('Floating Particles', '悬浮粒子'), icon: Sparkles },
    { id: 'a9', label: label('Heat Haze', '热浪扭曲'), icon: Sun },
    { id: 'a10', label: label('Smoke/Fog', '烟雾缭绕'), icon: CloudRain },
    { id: 'custom_ambient', label: label('Custom Atmosphere', '自定义氛围'), icon: Edit3, isCustom: true },
  ],
  Camera: [
    { id: 'c1', label: label('Static (Tripod)', '固定机位'), icon: Camera },
    { id: 'c2', label: label('Slow Zoom In', '缓慢推镜头'), icon: Maximize2 },
    { id: 'c3', label: label('Slow Zoom Out', '缓慢拉镜头'), icon: Minimize2 },
    { id: 'c4', label: label('Pan Left', '镜头左摇'), icon: MoveLeft },
    { id: 'c5', label: label('Pan Right', '镜头右摇'), icon: MoveRight },
    { id: 'c6', label: label('Handheld', '手持呼吸感'), icon: Activity },
    { id: 'c7', label: label('Dutch Angle', '荷兰角倾斜'), icon: RefreshCw },
    { id: 'c8', label: label('Rack Focus', '变焦 (背景->人物)'), icon: User },
    { id: 'c9', label: label('Dolly Zoom', '希区柯克变焦'), icon: Film },
    { id: 'c10', label: label('360 Orbit', '环绕拍摄'), icon: RefreshCw },
    { id: 'custom_cam', label: label('Custom Camera', '自定义运镜'), icon: Edit3, isCustom: true },
  ],
};

// ── Per-action detailed descriptions for Veo3 prompt ──────────────────────────
const ACTION_DESCRIPTIONS = {
  // Head
  h1: { subject: "slowly and naturally tilts their head to the left, a gentle lean of about 15 degrees, held with relaxed ease" },
  h2: { subject: "gently tilts their head to the right, a soft natural lean of about 15 degrees, as if listening or thinking" },
  h3: { subject: "lifts their gaze upward, raising their chin slightly with a calm and confident presence" },
  h4: { subject: "lowers their head gently, tilting their chin downward in a shy, reflective manner" },
  h5: { subject: "performs one or two slow, deliberate nods, as if in quiet agreement" },
  h6: { subject: "performs a subtle slow side-to-side head shake, as if gently expressing uncertainty" },
  h7: { subject: "turns their head to the left, rotating about 35 degrees, glancing naturally off to the side" },
  h8: { subject: "turns their head to the right, rotating about 35 degrees, as if noticing something nearby" },
  h9: { subject: "gently rolls and stretches their neck in a relaxed, organic side-to-side tilt" },
  h10: { subject: "bobs their head in a subtle rhythmic groove, as if swaying to an inner beat" },
  // Expression
  e1: { subject: "a warm, genuine smile gradually spreads across their face, with natural upward movement at the corners of the mouth and a soft brightening of the eyes" },
  e2: { subject: "breaks into a wide, joyful laugh — mouth opens, cheeks lift, eyes crinkle at the corners, radiating real happiness" },
  e3: { subject: "their expression becomes composed and serious — neutral mouth, steady gaze, with a quiet intensity in the eyes" },
  e4: { subject: "eyebrows raise, eyes widen, and mouth opens slightly in a natural expression of surprise or astonishment" },
  e5: { subject: "expression shifts to gentle sadness — brow slightly furrowed, corners of the mouth downturned, eyes becoming soft and downcast" },
  e6: { subject: "juts their lower lip out in a playful pout, with slightly furrowed brows suggesting cute sulkiness" },
  e7: { subject: "gives a subtle, alluring expression — a slight smirk, one eyebrow gently raised, a confident and playful look in the eyes" },
  e8: { subject: "wrinkles their nose and curls one side of their mouth in a natural expression of mild disgust or distaste" },
  e9: { subject: "eyes widen, eyebrows raise toward the center of the forehead, expression conveying genuine fear or anxiety" },
  e10: { subject: "tilts their head slightly and furrows one brow, their expression conveying genuine puzzlement or confusion" },
  // Eyes
  y1: { subject: "blinks naturally one or two times with a relaxed, unhurried rhythm" },
  y2: { subject: "gives a playful, confident wink with their left eye while keeping the right eye steady" },
  y3: { subject: "gives a quick, charming wink with their right eye" },
  y4: { subject: "performs a slow, expressive eye roll upward and to the side" },
  y5: { subject: "eyes shift naturally from side to side as if taking in their surroundings, then return to look forward" },
  y6: { subject: "narrows their eyes slightly, as if looking at something in bright light or with focused concentration" },
  y7: { subject: "eyes open wide and alert, conveying intensity or heightened awareness" },
  y8: { subject: "tears well up gently in their eyes and roll slowly down their cheeks, with a subtle quiver of emotion" },
  y9: { subject: "eyelids grow heavy and droop slowly, blinking in a drowsy, languid rhythm as if fighting sleep" },
  y10: { subject: "eyes brighten and sparkle with excitement and joy, wide, luminous, and full of life" },
  // Ambient (scene-level, not subject-level)
  a1: { scene: "the subject's chest and shoulders rise and fall with a calm, visible breathing rhythm" },
  a2: { scene: "a gentle breeze passes through the subject's hair, causing it to sway and flutter softly and naturally" },
  a3: { scene: "soft rain falls in the background, with droplets drifting through the air, creating a moody, atmospheric mood" },
  a4: { scene: "soft snowflakes drift gently in the background, creating a peaceful and wintry atmosphere" },
  a5: { scene: "subtle neon color flickers and light glitch distortions pulse in the background, giving a cyberpunk aesthetic" },
  a6: { scene: "warm golden sunlight shifts slowly across the subject's face, as if clouds are gently passing overhead" },
  a7: { scene: "the background has a beautiful cinematic shallow depth-of-field bokeh blur, keeping the subject sharp and the surroundings soft" },
  a8: { scene: "tiny sparkling dust motes and light particles float gently through the air around the subject" },
  a9: { scene: "the air behind the subject shimmers with a subtle heat-haze distortion" },
  a10: { scene: "soft, wispy smoke or fog drifts through the scene, creating a mysterious, dreamlike atmosphere" },
  // Camera (camera-level)
  c1: { camera: "the camera is completely stationary, perfectly still, as if mounted on a solid tripod" },
  c2: { camera: "the camera performs a very slow, smooth push-in zoom toward the subject's face" },
  c3: { camera: "the camera slowly pulls back in a gentle zoom-out, revealing more of the scene" },
  c4: { camera: "the camera performs a slow, smooth pan to the left" },
  c5: { camera: "the camera performs a slow, smooth pan to the right" },
  c6: { camera: "the camera has a subtle organic handheld sway — gentle micro-movements giving the shot a natural, documentary feel" },
  c7: { camera: "the frame is held at a slight Dutch angle tilt, giving the shot a stylized and dramatic composition" },
  c8: { camera: "focus smoothly transitions from a soft blurred background to the sharp subject in a cinematic rack focus pull" },
  c9: { camera: "a dramatic Hitchcock dolly-zoom effect — camera moves forward while zooming out simultaneously, creating surreal depth distortion" },
  c10: { camera: "the camera slowly orbits around the subject in a smooth, sweeping arc" },
};

const AccordionGroup = ({ title, items, selected, onToggle, onCustomChange, customValues, lang }) => {
  const [isOpen, setIsOpen] = useState(false);
  const t = TEXTS[lang];

  useEffect(() => {
    const hasSelection = items.some(item => selected.includes(item.id));
    if (hasSelection && !isOpen) setIsOpen(true);
  }, [selected]);

  return (
    <div className="mb-2 border border-white/5 rounded-lg overflow-hidden bg-zinc-900/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-gray-300 hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
            <ChevronRight size={14} />
          </div>
          <span>{title}</span>
        </div>
        <span className="text-xs text-blue-500 font-medium">
          {items.filter(i => selected.includes(i.id)).length > 0 &&
            `${items.filter(i => selected.includes(i.id)).length}`
          }
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-black/20"
          >
            <div className="p-2 grid grid-cols-1 gap-1">
              {items.map(item => {
                const isSelected = selected.includes(item.id);
                return (
                  <div key={item.id}>
                    <div
                      onClick={() => onToggle(item.id)}
                      className={`
                        flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-all border border-transparent
                        ${isSelected
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'hover:bg-white/5 text-gray-400 border-transparent'}
                        `}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon size={16} />
                        <span>{lang === 'zh' ? item.label.zh : item.label.en}</span>
                      </div>
                      {isSelected && <Check size={14} />}
                    </div>
                    {item.isCustom && isSelected && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="pl-8 pr-2 pb-2 pt-1"
                      >
                        <input
                          type="text"
                          value={customValues[item.id] || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onCustomChange(item.id, e.target.value)}
                          placeholder={t.customInputPlaceholder}
                          className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                        />
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Activation Gate ────────────────────────────────────────────────────────────

function ActivationGate({ lang, onActivated }) {
  const t = TEXTS[lang];
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Generate or reuse a stable device ID
      let deviceId = localStorage.getItem('pengip_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('pengip_device_id', deviceId);
      }

      const resp = await fetch(`${API_BASE}/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), deviceId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || data.message || '激活失败，请检查激活码');
        return;
      }
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        onActivated(data.token, data.user?.balance ?? data.balance ?? 0);
      } else {
        setError('服务器未返回 token，请联系鹏哥');
      }
    } catch (e) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <Video size={24} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">MicroMotion</h1>
            <p className="text-xs text-zinc-500">AI Portrait Animator</p>
          </div>
          <a
            href="https://pengip.com"
            className="p-1.5 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 border border-white/5 transition-colors"
            title="返回主页"
          >
            <Home size={14} />
          </a>
        </div>

        <h2 className="text-base font-semibold text-zinc-200 mb-1">{t.activateTitle}</h2>
        <p className="text-xs text-zinc-500 mb-6">{t.activateDesc}</p>

        <div className="mb-4">
          <label className="text-xs text-zinc-400 mb-1.5 block">{t.activateCode}</label>
          <div className="relative">
            <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleActivate()}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full bg-black border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleActivate}
          disabled={loading || !code.trim()}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" className="text-yellow-300" />}
          {loading ? t.activating : t.activateBtn}
        </button>

        <div className="mt-4 p-3 bg-zinc-800 rounded-lg text-center">
          <p className="text-xs text-zinc-400">
            请联系鹏哥微信：<span className="font-semibold text-blue-400">Peng_IP</span> 购买年卡或者获得7天试用
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

function App() {
  const [lang, setLang] = useState('zh');
  const t = TEXTS[lang];

  // Auth state
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [balance, setBalance] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 优先尝试从主站 cookie 换取新 token（同域，cookie 自动携带）
  useEffect(() => {
    async function tryAutoLogin() {
      try {
        const res = await fetch('/api/v1/user/token');
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            setToken(data.token);
            if (data.user?.balance !== undefined) setBalance(data.user.balance);
          }
        }
      } catch { /* 主站不可达时降级到已存 token */ }
      setAuthLoading(false);
    }
    tryAutoLogin();
  }, []);

  // Fetch balance on mount (if token exists)
  useEffect(() => {
    if (token) fetchBalance();
  }, [token]);
  const [imageFile, setImageFile] = useState(null);
  const [image, setImage] = useState(null);
  const [selectedActions, setSelectedActions] = useState([]);
  const [customActionValues, setCustomActionValues] = useState({});
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState([]);

  const [customPrompt, setCustomPrompt] = useState("");
  const [logs, setLogs] = useState([]);
  const consoleEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Fetch balance on mount (if token exists)
  useEffect(() => {
    if (token) fetchBalance();
  }, [token]);

  const fetchBalance = async () => {
    try {
      const resp = await fetch(`${API_BASE}/license/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.balance !== undefined) setBalance(data.balance);
    } catch {}
  };

  const handleActivated = (newToken, newBalance) => {
    setToken(newToken);
    setBalance(newBalance);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setBalance(null);
  };

  // Prompt builder — Veo3 structured natural language
  useEffect(() => {
    const subjectLines = [];
    const sceneLines = [];
    const cameraLines = [];

    selectedActions.forEach(id => {
      let foundItem = null;
      Object.values(ACTIONS_DATA).forEach(group => {
        const item = group.find(a => a.id === id);
        if (item) foundItem = item;
      });
      if (!foundItem) return;

      if (foundItem.isCustom && customActionValues[id]) {
        subjectLines.push(customActionValues[id]);
        return;
      }

      const desc = ACTION_DESCRIPTIONS[id];
      if (!desc) return;
      if (desc.subject) subjectLines.push(desc.subject);
      if (desc.scene) sceneLines.push(desc.scene);
      if (desc.camera) cameraLines.push(desc.camera);
    });

    const parts = [
      "A photorealistic portrait video, faithful to the reference photo. The subject's face, hair, skin tone, clothing, and background must remain identical throughout the entire clip.",
    ];

    if (subjectLines.length > 0) {
      parts.push(`Subject motion: The subject ${subjectLines.join('; ')}.`);
    } else {
      parts.push("Subject motion: The subject remains nearly still, with only a subtle natural breathing motion.");
    }

    if (sceneLines.length > 0) {
      parts.push(`Scene & atmosphere: ${sceneLines.join(' Additionally, ')}.`);
    }

    if (cameraLines.length > 0) {
      parts.push(`Camera: ${cameraLines.join(' ')}.`);
    } else {
      parts.push("Camera: Static, no camera movement.");
    }

    parts.push("The motion is smooth, organic, and lifelike. Avoid: face morphing, identity change, background drift, flickering, jump cuts, or any distortion.");

    setCustomPrompt(parts.join('\n\n'));
  }, [selectedActions, customActionValues]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
      setImageFile(file);
      setResults([]);
      addLog(`Image loaded: ${file.name}`);
    }
  };

  const toggleAction = (actionId) => {
    setSelectedActions(prev =>
      prev.includes(actionId) ? prev.filter(id => id !== actionId) : [...prev, actionId]
    );
  };

  const handleCustomChange = (id, value) => {
    setCustomActionValues(prev => ({ ...prev, [id]: value }));
  };

  // Poll task status
  const pollStatus = (taskId, imagePreviewUrl) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 120; // 10 minutes max (5s interval)

    const poll = async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        addLog("ERROR: Timeout - generation took too long");
        setIsGenerating(false);
        return;
      }

      try {
        const resp = await fetch(`${API_BASE}/status/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        addLog(`Polling... status: ${data.status}${data.yunwu_status ? ` (${data.yunwu_status})` : ''}`);

        if (data.status === 'completed') {
          const videoUrl = data.video_url;
          setResults(prev => [{
            id: taskId,
            action: selectedActions.length > 0 ? 'Video Ready' : 'Default Motion',
            src: imagePreviewUrl,
            videoUrl,
            ratio: aspectRatio,
          }, ...prev]);
          setIsGenerating(false);
          addLog(`Success! Video ready: ${videoUrl}`);
          fetchBalance(); // Refresh balance after deduction
        } else if (data.status === 'failed') {
          const errMsg = data.error || 'Generation failed';
          addLog(`ERROR: ${errMsg}`);
          if (errMsg.includes('reCAPTCHA') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
            alert("生成失败：AI 服务器当前请求繁忙（Google Veo3 限流），请等待 5～10 分钟后再重试。\n\n提示：请勿短时间内连续提交多个任务，等上一个完成后再提交下一个。");
          } else {
            alert(`生成失败：${errMsg}`);
          }
          setIsGenerating(false);
        } else {
          pollTimerRef.current = setTimeout(poll, 5000);
        }
      } catch (e) {
        addLog(`Poll error: ${e.message}, retrying...`);
        pollTimerRef.current = setTimeout(poll, 5000);
      }
    };

    pollTimerRef.current = setTimeout(poll, 5000);
  };

  const handleGenerate = async () => {
    if (!image || !imageFile) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setIsGenerating(true);

    addLog("Initializing MotionX Engine v2.0...");
    addLog(`Config: Ratio=${aspectRatio}, Actions=[${selectedActions.length}]`);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("prompt", customPrompt);
      formData.append("aspect_ratio", aspectRatio);
      formData.append("actions", selectedActions.join(','));

      addLog("Uploading image and submitting task...");

      const resp = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await resp.json();

      if (!resp.ok) {
        const msg = data.detail || data.error || `HTTP ${resp.status}`;
        if (resp.status === 402) {
          addLog(`ERROR: 积分不足`);
          alert(msg);
        } else if (resp.status === 400) {
          addLog(`ERROR: 请求参数错误`);
          alert(msg || "图片格式或参数有误，请使用清晰的人物正面照，文件大小不超过 10MB。");
        } else if (resp.status === 503 || resp.status === 502) {
          addLog(`ERROR: AI 服务繁忙，请稍后重试`);
          alert("AI 服务器当前请求繁忙，请稍等片刻后重试。");
        } else {
          addLog(`ERROR: ${msg}`);
          alert(msg || `生成失败（错误码：${resp.status}），请稍后重试。`);
        }
        setIsGenerating(false);
        return;
      }

      addLog(`Task submitted! ID: ${data.task_id}`);
      addLog("Waiting for Yunwu to generate video (may take 1-5 minutes)...");

      pollStatus(data.task_id, image);

    } catch (err) {
      addLog(`ERROR: ${err.message}`);
      setIsGenerating(false);
    }
  };

  // Show loading while auto-login is in progress
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#09090b' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Show activation gate if not logged in
  if (!token) {
    return <ActivationGate lang={lang} onActivated={handleActivated} />;
  }

  return (
    <div className="app-container selection:bg-blue-500/30 selection:text-blue-200">

      {/* 1. Sidebar */}
      <aside className="sidebar">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-xl font-bold text-accent-primary">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Video size={20} />
            </div>
            <span className="tracking-tight">MotionX</span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="https://pengip.com"
              title="返回主页"
              className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 transition-colors"
            >
              <Home size={14} />
            </a>
            <button
              onClick={() => setLang(prev => prev === 'en' ? 'zh' : 'en')}
              className="p-1 px-2 rounded hover:bg-white/10 text-[10px] text-gray-400 border border-white/5 uppercase font-medium tracking-wider"
            >
              {lang === 'en' ? 'EN' : ' 中 '}
            </button>
          </div>
        </div>

        {/* Balance & Logout */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Coins size={12} className="text-yellow-500" />
            <span>{t.balance}: <span className="text-yellow-400 font-medium">{balance ?? '...'}</span></span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={10} /> {t.logout}
          </button>
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Layers size={10} />
            {t.history}
          </span>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 opacity-30 gap-2">
              <Film size={24} />
              <span className="text-xs italic">{t.noHistory}</span>
            </div>
          )}
          {results.map((res) => (
            <div key={res.id} className="bg-zinc-800/40 rounded-lg p-2.5 flex flex-col gap-2 hover:bg-zinc-800 transition-colors border border-white/5 group">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-md overflow-hidden bg-black aspect-square">
                  <img src={res.src} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-transparent">
                    <Play size={16} className="text-white drop-shadow-md" fill="white" />
                  </div>
                </div>
                <div className="overflow-hidden flex-1 flex flex-col justify-center">
                  <div className="text-xs font-medium truncate text-gray-200 mb-0.5">{res.action}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-1">
                    <span className="uppercase">{res.ratio}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                {res.videoUrl ? (
                  <>
                    <a
                      href={res.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-black/30 hover:bg-blue-500 hover:text-white text-[10px] py-1.5 rounded text-gray-400 transition-colors flex items-center justify-center gap-1.5 border border-white/5"
                    >
                      <Download size={10} /> {t.download}
                    </a>
                  </>
                ) : (
                  <button className="flex-1 bg-black/30 text-[10px] py-1.5 rounded text-gray-600 border border-white/5 cursor-not-allowed">
                    Processing...
                  </button>
                )}
              </div>
              {res.videoUrl && (
                <p className="text-[9px] text-yellow-500/70 text-center mt-1">{t.downloadWarning}</p>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 2. Main Workspace */}
      <main className="main-content">
        <div className="viewport">
          {!image ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => fileInputRef.current.click()}
              className="upload-placeholder group"
            >
              <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileSelect} />
              <div className="p-5 rounded-full bg-zinc-800/80 mb-6 ring-1 ring-white/10 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-all shadow-xl">
                <Upload size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-medium text-zinc-200 mb-2 tracking-tight">{t.uploadTitle}</h3>
              <p className="text-sm text-zinc-500">{t.uploadDesc}</p>
              <div className="mt-4 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-300 leading-relaxed">{t.uploadTip}</p>
              </div>
            </motion.div>
          ) : (
            <div className="preview-container aspect-auto max-w-[80%] max-h-[90%] relative group">
              <img src={image} className="preview-image" />

              <div className="absolute top-0 left-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-start">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold bg-black/60 px-2 py-1 rounded text-zinc-300 backdrop-blur border border-white/10 uppercase tracking-wider">Source</span>
                    <span className="text-[10px] font-bold bg-blue-500/80 px-2 py-1 rounded text-white backdrop-blur border border-blue-400/20 uppercase tracking-wider">Face Lock On</span>
                  </div>
                  <button onClick={() => setImage(null)} className="p-2 hover:bg-red-500/80 text-white rounded-full bg-black/40 backdrop-blur border border-white/10 transition-all">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="relative w-16 h-16 mb-6">
                      <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                    </div>
                    <span className="text-blue-400 text-lg font-medium animate-pulse mb-2">{t.generating}</span>
                    <p className="text-zinc-500 text-xs max-w-[200px]">Generating with {aspectRatio} ratio... may take 1-5 min</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Bottom: Console Log */}
        <div className="console-area custom-scrollbar">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Terminal size={12} />
              <span className="uppercase tracking-widest font-bold">{t.consoleTitle}</span>
            </div>
            <button onClick={() => setLogs([])} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1">
            {logs.length === 0 && <span className="text-zinc-700 italic opacity-50">... System Idle ...</span>}
            {logs.map((log, i) => (
              <div key={i} className="text-zinc-400 hover:text-zinc-200 break-all border-l-2 border-transparent hover:border-zinc-700 pl-2 transition-colors">
                <span className="text-blue-500/50 mr-2">➜</span>{log}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>

      </main>

      {/* 3. Right Control Panel */}
      <aside className="control-panel w-[320px]">

        {/* Settings Block: Aspect Ratio — Veo3 only supports 16:9 and 9:16 */}
        <div className="mb-6">
          <label className="select-group-header flex items-center justify-between">
            <span>{t.aspectRatio}</span>
            <Monitor size={12} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {["16:9", "9:16"].map(ratio => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`py-2 text-xs rounded-lg border transition-all font-medium flex items-center justify-center gap-1
                  ${aspectRatio === ratio
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                    : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}
                `}
              >
                {ratio === "16:9" && <div className="w-3 h-2 border border-current rounded-[1px]"></div>}
                {ratio === "9:16" && <div className="w-2 h-3 border border-current rounded-[1px]"></div>}
                <span>{ratio}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {lang === 'zh' ? '⚠️ 图片将自动裁剪以匹配所选比例' : '⚠️ Image will be auto-cropped to match selected ratio'}
          </p>
        </div>

        {/* Action Selection */}
        <div className="flex-1 mb-6 flex flex-col min-h-0">
          <label className="select-group-header flex items-center justify-between">
            <span>{t.motionPresets}</span>
            <span className="text-xs normal-case font-normal text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Multi-select</span>
          </label>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
            {Object.keys(ACTIONS_DATA).map(category => (
              <AccordionGroup
                key={category}
                title={t.categories[category]}
                items={ACTIONS_DATA[category]}
                selected={selectedActions}
                onToggle={toggleAction}
                onCustomChange={handleCustomChange}
                customValues={customActionValues}
                lang={lang}
              />
            ))}
          </div>
        </div>

        {/* Prompt Summary */}
        <div className="mb-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} className="text-blue-400" />
            <span className="select-group-header">{lang === 'zh' ? 'AI 参数摘要' : 'AI Parameters'}</span>
          </div>
          <div className="bg-black/40 border border-zinc-800 rounded-lg p-3 space-y-1.5">
            {selectedActions.length === 0 ? (
              <p className="text-[10px] text-zinc-600 italic">{lang === 'zh' ? '未选择动作，将生成自然呼吸效果' : 'No actions selected — subtle breathing motion'}</p>
            ) : (
              Object.entries(ACTIONS_DATA).map(([category, items]) => {
                const active = items.filter(item => selectedActions.includes(item.id));
                if (active.length === 0) return null;
                return (
                  <div key={category} className="flex items-start gap-2">
                    <span className="text-[10px] text-zinc-500 w-16 shrink-0 pt-0.5">{t.categories[category]}</span>
                    <div className="flex flex-wrap gap-1">
                      {active.map(item => (
                        <span key={item.id} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                          {lang === 'zh' ? item.label.zh : item.label.en}
                          {item.isCustom && customActionValues[item.id] ? `: ${customActionValues[item.id].slice(0, 12)}…` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <div className="flex items-center gap-2 pt-1 mt-1 border-t border-zinc-800/60">
              <span className="text-[10px] text-zinc-500 w-16 shrink-0">{lang === 'zh' ? '画幅' : 'Ratio'}</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">{aspectRatio}</span>
            </div>
          </div>
        </div>

        {/* Generate Btn */}
        <button
          disabled={!image || isGenerating}
          onClick={handleGenerate}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 border border-white/5"
        >
          {isGenerating ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <Zap size={18} fill="currentColor" className="text-yellow-300" />
          )}
          <span className="tracking-wide">
            {isGenerating ? t.generating : `${t.generate} (-50 pts)`}
          </span>
        </button>

        {/* Warning */}
        <p className="text-[10px] text-yellow-500/80 text-center mt-2 leading-relaxed">{t.generateWarning}</p>

      </aside>

    </div>
  );
}

export default App;
