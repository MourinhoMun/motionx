
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

  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [selectedActions, setSelectedActions] = useState([]);
  const [customActionValues, setCustomActionValues] = useState({});
  const [aspectRatio, setAspectRatio] = useState("16:9");
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

  // Prompt builder — Veo3 natural language style
  useEffect(() => {
    const actionPrompts = selectedActions.map(id => {
      let lbl = "";
      Object.values(ACTIONS_DATA).forEach(group => {
        const found = group.find(a => a.id === id);
        if (found) {
          lbl = found.isCustom && customActionValues[id]
            ? customActionValues[id]
            : found.label.en;
        }
      });
      return lbl;
    }).filter(Boolean);

    const motionDesc = actionPrompts.length > 0
      ? `The subject performs: ${actionPrompts.join(", ")}.`
      : "The subject makes a very subtle, natural breathing motion.";

    setCustomPrompt(
      `Photorealistic video. Keep the person's face, hair, clothing, and background exactly as in the reference image. ${motionDesc} Cinematic lighting, high fidelity, no morphing, no distortion, no scene change.`
    );
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
          addLog(`ERROR: ${data.error || 'Generation failed'}`);
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
        } else if (resp.status === 503) {
          addLog(`ERROR: AI 服务繁忙，请稍后重试`);
          alert("AI 服务器当前请求繁忙，请稍等片刻后重试。");
        } else {
          addLog(`ERROR: ${msg}`);
          alert(`生成失败，请稍后重试。`);
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
                  <a
                    href={res.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-black/30 hover:bg-blue-500 hover:text-white text-[10px] py-1.5 rounded text-gray-400 transition-colors flex items-center justify-center gap-1.5 border border-white/5"
                  >
                    <Download size={10} /> {t.download}
                  </a>
                ) : (
                  <button className="flex-1 bg-black/30 text-[10px] py-1.5 rounded text-gray-600 border border-white/5 cursor-not-allowed">
                    Processing...
                  </button>
                )}
              </div>
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

        {/* Prompt Engineer */}
        <div className="mb-4 pt-4 border-t border-zinc-800">
          <label className="select-group-header flex items-center gap-2 mb-2">
            <Edit3 size={12} />
            <span>{t.promptLabel}</span>
          </label>
          <div className="relative group">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full h-24 bg-black border border-zinc-800 rounded-lg p-3 text-[10px] text-zinc-400 font-mono resize-none focus:border-blue-500/50 focus:text-zinc-200 focus:outline-none transition-colors"
            />
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

      </aside>

    </div>
  );
}

export default App;
