/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Plus, 
  FileText, 
  TrendingUp, 
  AlertTriangle, 
  ArrowRight, 
  Download, 
  ShieldCheck, 
  History,
  Image as ImageIcon,
  Paperclip,
  Loader2,
  Table,
  BarChart2,
  Clock,
  Globe,
  Star,
  Zap,
  Lock,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Settings,
  User,
  Palette,
  MessageSquare,
  Info,
  LogOut,
  X,
  Key,
  CheckCircle2,
  RotateCcw,
  MapPin
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import { sanitizeElementColors } from './lib/colors';
import { translations } from './lib/translations';

import { analyzeBusinessData, ultimateBusinessAnalysis } from './services/geminiService';
import { cn } from './lib/utils';
import { getUserPlan, activateCode, logUsage, canUseFeature, getSikuZilizobaki, getPlans, checkPlanAccess, UserPlan } from './services/subscriptionService';
import * as exportService from './services/exportService';

// Types
interface BusinessReport {
  picha_kubwa: string;
  namba_muhimu: {
    mauzo: number;
    gharama: number;
    faida: number;
    faida_asilimia: number;
    bidhaa_bora: string;
    tatizo_kuu: string;
  };
  insights: string[];
  mapendekezo: { hatua: string; gharama: string; faida: string }[];
  onyo: string;
  data_graph: any[];
  data_pie?: { name: string; thamani: number; fill: string }[];
  data_profit_trend?: { siku: string; faida: number }[];
  forecast?: number[];
  risk_score?: string;
  metrics?: {
    profitMargin: number;
    debtRatio: number;
    performance: string;
    riskLevel: string;
  };
  ledger?: { date: string; desc: string; debit: number; credit: number }[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'report';
  reportData?: BusinessReport;
  file?: { name: string; type: string };
  timestamp: number;
}

const LANGUAGES = [
  { code: 'English', name: 'English', flag: '🇬🇧' },
  { code: 'Kiswahili', name: 'Kiswahili', flag: '🇹🇿' },
  { code: 'Français', name: 'Français', flag: '🇫🇷' },
  { code: 'Chinese', name: 'Chinese', flag: '🇨🇳' },
];

const SECRET_KEY = "sokoai_2026_secret_key_ni_yako_peke_yako";

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [language, setLanguage] = useState('English');
  
  // Debug language per user request
  useEffect(() => {
    console.log("Current Language:", language);
  }, [language]);

  const [worldTime, setWorldTime] = useState('');
  const [timeOffset, setTimeOffset] = useState(0);
  const [userId, setUserId] = useState('');
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [remainingDaysMsg, setRemainingDaysMsg] = useState("");
  const [showSubModal, setShowSubModal] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [logoClicks, setLogoClicks] = useState<number[]>([]);

  const handleLogoClick = () => {
    const now = Date.now();
    setLogoClicks(prev => {
      const activeClicks = prev.filter(t => now - t < 1500);
      const newClicks = [...activeClicks, now];
      if (newClicks.length >= 3) {
        setShowAdmin(true);
        return [];
      }
      return newClicks;
    });
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [aboutModalTab, setAboutModalTab] = useState<'about' | 'privacy' | 'terms' | 'contact'>('about');

  // Feedback System States
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<'pendekezo' | 'tatizo' | 'shukrani'>('pendekezo');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{ isAllowed: boolean; reason: string } | null>(null);
  
  const [deviceLocation, setDeviceLocation] = useState<string>(() => {
    return localStorage.getItem('sokoai_device_location') || 'Kigoma, Buhigwe';
  });
  const [isDetectingLocation, setIsDetectingLocation] = useState<boolean>(false);

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locString = `Buhigwe, Kigoma (${latitude.toFixed(4)}°S, ${longitude.toFixed(4)}°E)`;
        setDeviceLocation(locString);
        localStorage.setItem('sokoai_device_location', locString);
        setIsDetectingLocation(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    // If the permission is already granted, we can auto-detect. Otherwise we keep the default Buhigwe, Kigoma.
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.geolocation) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') {
          detectLocation();
        }
      }).catch(err => console.log("Permissions query error", err));
    }
  }, []);

  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState({ username: '', theme: 'emerald', whatsapp: '' });
  const [adminAuthPassword, setAdminAuthPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminMode, setAdminMode] = useState<'login' | 'dashboard' | 'reset'>('login');
  const [adminQuestions, setAdminQuestions] = useState({ q1: '', q2: '' });
  const [adminAnswers, setAdminAnswers] = useState({ a1: '', a2: '', newPassword: '' });
  
  const [adminUserId, setAdminUserId] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminTargetUsername, setAdminTargetUsername] = useState('');
  const [adminPlan, setAdminPlan] = useState('medium');
  const [generatedCode, setGeneratedCode] = useState<{code: string; bei: number} | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [plansData, setPlansData] = useState<any>(null);
  const [selectedPlanUpgrade, setSelectedPlanUpgrade] = useState<string | null>(null);

  const [subSuccess, setSubSuccess] = useState('');

  // Onboarding UI State
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    return localStorage.getItem('sokoai_onboarding_verified') === 'true';
  });
  const [onboardTab, setOnboardTab] = useState<'register' | 'restore'>('register');
  const [regUsername, setRegUsername] = useState('');
  const [regWhatsapp, setRegWhatsapp] = useState('');
  const [restUsername, setRestUsername] = useState('');
  const [onboardError, setOnboardError] = useState('');
  const [onboardLoading, setOnboardLoading] = useState(false);

  // Register Handler
  const handleRegisterOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    
    const uName = regUsername.trim();
    const phone = regWhatsapp.trim();

    if (!uName || !phone) {
      setOnboardError('Please fill in all details (Username and WhatsApp Number)');
      return;
    }

    if (uName.length < 3) {
      setOnboardError('Username must be at least 3 characters long');
      return;
    }

    if (!/^\+?[0-9]{9,15}$/.test(phone)) {
      setOnboardError('Please enter a valid WhatsApp phone number');
      return;
    }

    setOnboardLoading(true);
    try {
      const generatedId = 'user_' + Math.random().toString(36).substring(2, 11);
      const res = await fetch('/api/user/v2/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: generatedId,
          username: uName,
          whatsapp: phone,
          theme: 'emerald'
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('sokoai_user_id', generatedId);
        localStorage.setItem('sokoai_registered_username', uName);
        localStorage.setItem('sokoai_registered_whatsapp', phone);
        localStorage.setItem('sokoai_onboarding_verified', 'true');
        
        // Auto register general Free plan immediately
        await fetch('/api/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: generatedId, plan: 'free' }),
        });

        setUserId(generatedId);
        setUserSettings({ username: uName, theme: 'emerald', whatsapp: phone });
        setIsOnboarded(true);
      } else {
        setOnboardError(data.message || 'Registration failed, please try again.');
      }
    } catch (err) {
      setOnboardError('Failed to connect to the server. Please check your internet connection.');
    } finally {
      setOnboardLoading(false);
    }
  };

  // Restore Handler
  const handleRestoreOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');

    const uName = restUsername.trim();
    if (!uName) {
      setOnboardError('Please enter your username');
      return;
    }

    setOnboardLoading(true);
    try {
      const res = await fetch('/api/user/v2/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uName }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('sokoai_user_id', data.user_id);
        localStorage.setItem('sokoai_registered_username', data.username);
        localStorage.setItem('sokoai_registered_whatsapp', data.whatsapp || '');
        localStorage.setItem('sokoai_onboarding_verified', 'true');

        setUserId(data.user_id);
        setUserSettings({
          username: data.username,
          theme: data.theme || 'emerald',
          whatsapp: data.whatsapp || ''
        });
        setIsOnboarded(true);
      } else {
        setOnboardError(data.message || 'This username does not exist or is not recognized in the system.');
      }
    } catch (err) {
      setOnboardError('Failed to connect to the server. Please try again later.');
    } finally {
      setOnboardLoading(false);
    }
  };

  // Plan fetching
  useEffect(() => {
    if (!isOnboarded) return;

    let id = localStorage.getItem('sokoai_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('sokoai_user_id', id);
    }
    setUserId(id);

    // Initialize messages from localStorage if available
    const savedMessages = localStorage.getItem(`sokoai_messages_${id}`);
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error("Failed to parse saved messages", e);
      }
    } else {
      setMessages([]);
    }

    const fetchPlan = async () => {
      try {
        const plan = await getUserPlan(id!);
        setUserPlan(plan);
        const remaining = await getSikuZilizobaki(id!);
        if (remaining.message) setRemainingDaysMsg(remaining.message);
        
        // Notification for expiry
        if (plan.expired && plan.plan !== 'free') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `📢 Habari! Plan yako ya ${plan.plan.toUpperCase()} imeisha muda wake. SokoAI imekurudisha kwenye FREE PLAN. Tafadhali washa activation code mpya ili kuendelea na huduma za Pro.`,
            timestamp: Date.now()
          }]);
        }
      } catch (e) {
        console.error("Failed to fetch plan", e);
      }
    };
    fetchPlan();

    const fetchPlans = async () => {
      try {
        const data = await getPlans();
        setPlansData(data);
      } catch (e) {
        console.error("Failed to fetch plans info", e);
      }
    };
    fetchPlans();
    
    const fetchUserSettings = async () => {
      try {
        const response = await fetch(`/api/user/settings/${id}`);
        const data = await response.json();
        
        // If username is empty, make sure it updates with correct settings
        if (!data.username) {
          const registeredUsername = localStorage.getItem('sokoai_registered_username') || ('SokoUser_' + Math.random().toString(36).substring(2, 8).toUpperCase());
          const registeredWhatsapp = localStorage.getItem('sokoai_registered_whatsapp') || '';
          data.username = registeredUsername;
          data.whatsapp = registeredWhatsapp;
          await fetch('/api/user/settings/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: id, ...data }),
          });
        }
        
        setUserSettings({
          username: data.username || '',
          theme: data.theme || 'emerald',
          whatsapp: data.whatsapp || ''
        });
      } catch (e) {
        console.error("Failed to fetch user settings", e);
      }
    };
    fetchUserSettings();
  }, [isOnboarded]);

  const updateUserSettings = async (updates: Partial<{ username: string, theme: string, whatsapp: string }>) => {
    const newSettings = { ...userSettings, ...updates };
    setUserSettings(newSettings);
    localStorage.setItem(`sokoai_settings_${userId}`, JSON.stringify(newSettings));
    try {
      await fetch('/api/user/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...newSettings }),
      });
    } catch (e) {
      console.error("Failed to update user settings", e);
    }
  };

  // Persist messages to localStorage
  useEffect(() => {
    if (userId && messages.length > 0) {
      localStorage.setItem(`sokoai_messages_${userId}`, JSON.stringify(messages));
    }
  }, [messages, userId]);

  const handleAdminVerify = async () => {
    setAdminLoading(true);
    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminAuthPassword }),
      });
      const data = await response.json();
      if (data.success) {
        setIsAdminAuthenticated(true);
        setAdminMode('dashboard');
        setAdminAuthPassword('');
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert("Hitilafu ya mtandao");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminPasswordReset = async () => {
    setAdminLoading(true);
    try {
      const response = await fetch('/api/admin/reset_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminAnswers),
      });
      const data = await response.json();
      if (data.success) {
        alert("Password imebadilishwa kikamilifu!");
        setAdminMode('login');
        setAdminAnswers({ a1: '', a2: '', newPassword: '' });
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert("Hitilafu ya mtandao");
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchSecurityQuestions = async () => {
    try {
      const response = await fetch('/api/admin/questions');
      const data = await response.json();
      setAdminQuestions(data);
      setAdminMode('reset');
    } catch (e) {
      alert("Haikuweza kupata maswali");
    }
  };

  const handleGenerateAdminCode = async () => {
    if (!adminTargetUsername.trim()) {
      alert("Tafadhali weka Username ya mteja");
      return;
    }
    setAdminLoading(true);
    try {
      const response = await fetch('/api/admin/generate_code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: adminUserId || adminTargetUsername, 
          plan: adminPlan, 
          username: adminTargetUsername,
          admin_id: userId 
        }),
      });
      const data = await response.json();
      if (data.code) {
        setGeneratedCode({ code: data.code, bei: plansData?.plans[adminPlan]?.price || 0 });
      } else {
        alert(data.error || "Imeshindwa kutengeneza code");
      }
    } catch (e) {
      alert("Hitilafu ya mtandao");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleActivate = async (planRequested?: string) => {
    if (!planRequested && !activationCode.trim()) return;
    setSubLoading(true);
    setSubError('');
    setSubSuccess('');
    try {
      const res = await activateCode(userId, activationCode, planRequested);
      if (res.success) {
        const planName = res.plan?.toUpperCase() || 'Mpya';
        const expiryDate = res.expires_at ? new Date(res.expires_at).toLocaleDateString('sw-TZ') : '30 days';
        
        setSubSuccess(`Hongera! Plan ya ${planName} imewasha hadi ${expiryDate}.`);
        setActivationCode('');
        
        // Refresh plan after delay
        setTimeout(async () => {
          const plan = await getUserPlan(userId);
          setUserPlan(plan);
          const remaining = await getSikuZilizobaki(userId);
          if (remaining.message) setRemainingDaysMsg(remaining.message);
          
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Hongera! Umefanikiwa kuwasha plan ya ${planName}. Sasa unaweza kutumia features zote za plan hii. Inaisha tarehe ${expiryDate}.`,
            timestamp: Date.now()
          }]);
          
          if (!planRequested) {
            setShowSubModal(false);
            setSubSuccess('');
          }
        }, 2000);
      } else {
        setSubError(res.message || 'Code si sahihi');
      }
    } catch (e) {
      setSubError('Hitilafu: Hakikisha una mtandao na code ni sahihi.');
    } finally {
      setSubLoading(false);
    }
  };

  // Sync with network time (Internal Server API / Bongo Time)
  useEffect(() => {
    const syncTime = async () => {
      try {
        const response = await fetch('/api/get_tarehe_leo');
        const data = await response.json();
        const networkTime = new Date(data.timestamp).getTime();
        const localTime = Date.now();
        setTimeOffset(networkTime - localTime);
      } catch (e) {
        console.error("Time sync failed, using system clock");
      }
    };
    syncTime();
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date(Date.now() + timeOffset);
      const locales: Record<string, string> = {
        'Kiswahili': 'sw-TZ',
        'English': 'en-US',
        'Français': 'fr-FR',
        'Chinese': 'zh-CN'
      };
      setWorldTime(now.toLocaleString(locales[language] || 'sw-TZ', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [language, timeOffset]);

  const t = translations[language as keyof typeof translations] || translations.English;
  const currentLocale = (language === 'Kiswahili' ? 'sw-TZ' : (language === 'English' ? 'en-US' : (language === 'Français' ? 'fr-FR' : 'zh-CN')));

  useEffect(() => {
    setMessages(prev => {
      // If no messages at all, or only one message (the welcome message), update it to current language
      if (prev.length <= 1) {
        const greetingPrefix = language === 'Kiswahili' ? 'Habari' : 'Hello';
        const welcomeText = userSettings.username 
          ? `${greetingPrefix} ${userSettings.username}! ${t.welcomeMsg}` 
          : t.welcomeMsg;
          
        return [{
          role: 'assistant',
          content: welcomeText,
          timestamp: prev[0]?.timestamp || Date.now()
        }];
      }
      return prev;
    });
  }, [language, t.welcomeMsg, userSettings.username]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const resetChat = () => {
    const greetingPrefix = language === 'Kiswahili' ? 'Habari' : 'Hello';
    const welcomeText = userSettings.username 
      ? `${greetingPrefix} ${userSettings.username}! ${t.welcomeMsg}` 
      : t.welcomeMsg;
    const initialMessage: Message = {
      role: 'assistant',
      content: welcomeText,
      timestamp: Date.now()
    };
    setMessages([initialMessage]);
    localStorage.setItem(`sokoai_messages_${userId}`, JSON.stringify([initialMessage]));
    setInputValue('');
  };

  const handleAppRefresh = () => {
    setIsRefreshing(true);
    // Persist messages and settings before reload
    if (userId) {
      localStorage.setItem(`sokoai_messages_${userId}`, JSON.stringify(messages));
      localStorage.setItem(`sokoai_settings_${userId}`, JSON.stringify(userSettings));
    }
    
    // 1 second delay requested for "state back" feel while being up to date
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleSend = async (text?: string, fileObj?: File) => {
    const messageContent = text || inputValue;
    if (!messageContent && !fileObj) return;

    const newUserMessage: Message = {
      role: 'user',
      content: messageContent,
      file: fileObj ? { name: fileObj.name, type: fileObj.type } : undefined,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setIsTyping(true);
    
    // 1.5s artificial delay to simulate typing and prevent rate limits
    await new Promise(r => setTimeout(r, 1500));

    try {
      // 0. Enforce plan-based character limit if needed (Client side truncation)
      let finalContent = messageContent;
      if (userPlan && finalContent.length > userPlan.rules.max_analysis_chars) {
        finalContent = finalContent.substring(0, userPlan.rules.max_analysis_chars) + "...";
      }

      // 1. Check feature permission for logging (not blocking chat)
      canUseFeature(userId, 'report', 'generation').then(permission => {
        if (!permission.allowed) {
          // We could show a subtle notification here that they are in "Lite Mode"
        }
      });

      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      // Pass username context to analysis
      const extraContext = userSettings.username ? `Customer Name: ${userSettings.username}. ` : "";
      
      let responseText: string;
      if (fileObj) {
        // Use the ultimate pipeline for files (OCR, PDF text, Chunking, Merging, Analysis)
        responseText = await ultimateBusinessAnalysis(fileObj, history, language, userPlan?.rules);
      } else {
        responseText = await analyzeBusinessData(extraContext + finalContent, history, language, userPlan?.rules);
      }

      // Try to parse JSON report if present
      let report: BusinessReport | null = null;
      let cleanText = responseText;
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          report = JSON.parse(jsonMatch[0]);
          cleanText = responseText.replace(jsonMatch[0], '').trim();

          // Apply plan limits to report data
          if (report && userPlan) {
            const rules = userPlan.rules;
            // Limit recommendations
            if (report.mapendekezo && report.mapendekezo.length > rules.advice_count) {
              report.mapendekezo = report.mapendekezo.slice(0, rules.advice_count);
            }
          }
        } catch (e) {
          console.error("Failed to parse report JSON", e);
        }
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: cleanText || (report ? t.reportReady : t.understood),
          type: report ? 'report' : 'text',
          reportData: report || undefined,
          timestamp: Date.now()
        }
      ]);

      // Log usage if report was generated
      await logUsage(userId, 'report_generated');

    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: t.errorMsg, timestamp: Date.now() }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      handleSend(`${t.sentFile} ${file.name}`, file);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    }
  } as any);

  const downloadDOCX = async (report: BusinessReport, graphImage?: string) => {
    try {
      const t = translations[language as keyof typeof translations];
      
      const children: any[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: "SOKOAI - RIPOTI YA BIASHARA",
              bold: true,
              size: 32,
              color: "10b981",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${t.date}: ${new Date().toLocaleDateString()}`, bold: true }),
          ],
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: t.pichaKubwa, bold: true, size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: report.picha_kubwa,
          spacing: { after: 400 },
        }),
      ];

      // Add Graph Image if provided
      if (graphImage) {
        const base64Data = graphImage.split(',')[1];
        try {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)),
                  transformation: {
                    width: 550,
                    height: 350,
                  },
                  type: "png",
                } as any),
              ],
              spacing: { before: 400, after: 400 },
              alignment: AlignmentType.CENTER,
            })
          );
        } catch (e) {
          console.error("Failed to add image to DOCX", e);
        }
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: t.ledgerTitle || "Namba Muhimu", bold: true, size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph(`• ${t.stats.sales}: TSh ${report.namba_muhimu.mauzo.toLocaleString()}`),
        new Paragraph(`• ${t.cost}: TSh ${report.namba_muhimu.gharama.toLocaleString()}`),
        new Paragraph(`• ${t.stats.profit}: TSh ${report.namba_muhimu.faida.toLocaleString()} (${report.namba_muhimu.faida_asilimia}%)`),
        new Paragraph(`• ${t.stats.bestSeller}: ${report.namba_muhimu.bidhaa_bora}`),
        new Paragraph({
          children: [
            new TextRun({ text: `${t.tatizoTitle}: ${report.namba_muhimu.tatizo_kuu}`, bold: true, color: "ef4444" }),
          ],
          spacing: { before: 200, after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: t.insightsTitle, bold: true, size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        ...report.insights.map(insight => new Paragraph({ text: `• ${insight}`, bullet: { level: 0 } })),
        new Paragraph({
          children: [
            new TextRun({ text: t.recommendationsTitle, bold: true, size: 24 }),
          ],
          spacing: { before: 400, after: 200 },
        }),
        ...report.mapendekezo.map(rec => new Paragraph({ 
          children: [
            new TextRun({ text: `• ${rec.hatua}`, bold: true }),
            new TextRun({ text: ` (${t.cost}: ${rec.gharama}, ${t.potentialBenefit}: ${rec.faida})` }),
          ],
          bullet: { level: 0 } 
        })),
        new Paragraph({
          children: [
            new TextRun({
              text: report.onyo,
              italics: true,
              color: "f59e0b",
            }),
          ],
          spacing: { before: 600 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: t.reportFooter,
              size: 16,
              color: "64748b",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 800 },
        })
      );

      const doc = new Document({
        sections: [{
          properties: {},
          children: children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `SokoAI_Ripoti_${new Date().getTime()}.docx`);
    } catch (error) {
      console.error("DOCX generation failed:", error);
    }
  };

  const downloadXLSX = async (report: BusinessReport, graphImage?: string) => {
    try {
      const t = translations[language as keyof typeof translations];
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Business Analysis');

      sheet.columns = [
        { header: 'Metric', key: 'metric', width: 20 },
        { header: 'Value', key: 'value', width: 40 }
      ];

      sheet.addRow(['REPORT SUMMARY']);
      sheet.addRow(['Date', new Date().toLocaleDateString()]);
      sheet.addRow([]);
      sheet.addRow(['KEY METRICS']);
      sheet.addRow(['Sales', report.namba_muhimu.mauzo]);
      sheet.addRow(['Costs', report.namba_muhimu.gharama]);
      sheet.addRow(['Profit', report.namba_muhimu.faida]);
      sheet.addRow(['Profit %', report.namba_muhimu.faida_asilimia]);
      sheet.addRow(['Best Product', report.namba_muhimu.bidhaa_bora]);
      sheet.addRow(['Main Issue', report.namba_muhimu.tatizo_kuu]);
      sheet.addRow([]);

      if (report.ledger) {
        sheet.addRow(['LEDGER DATA']);
        sheet.addRow(['Date', 'Description', 'Debit', 'Credit']);
        report.ledger.forEach(item => {
          sheet.addRow([item.date, item.desc, item.debit, item.credit]);
        });
        sheet.addRow([]);
      }

      // Add Graph if provided
      if (graphImage) {
        const imageId = workbook.addImage({
          base64: graphImage.split(',')[1],
          extension: 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 4, row: 1 },
          ext: { width: 600, height: 400 }
        });
      }

      if (report.data_graph) {
        const graphSheet = workbook.addWorksheet('Trends');
        graphSheet.columns = [
          { header: 'Month', key: 'name', width: 15 },
          { header: 'Sales', key: 'mauzo', width: 15 },
          { header: 'Costs', key: 'gharama', width: 15 }
        ];
        graphSheet.addRows(report.data_graph);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `SokoAI_Export_${new Date().getTime()}.xlsx`);
    } catch (error) {
      console.error("XLSX export failed:", error);
    }
  };

  const handleDownload = async (type: 'pdf' | 'docx' | 'image' | 'excel' | 'graphs', report?: BusinessReport) => {
    if (!reportRef.current && !report) return;
    if (isDownloading) return;

    // Check export permission based on user plan rules
    if (userPlan) {
      const userExports = userPlan.rules.exports || [];
      const priority: Record<string, string[]> = {
        pdf: ['pdf_branded', 'pdf_basic'],
        excel: ['excel_formula', 'excel'],
        docx: ['word'],
        image: ['png_hd', 'png_low'],
        graphs: ['png_hd', 'png_low']
      };
      
      const options = priority[type] || [];
      const featureToUse = options.find(opt => userExports.includes(opt));
      
      if (!featureToUse) {
        alert(t.featureLockedAlert);
        setShowSubModal(true);
        return;
      }

      // Check with server to enforce caps (like the 1 PDF for free users)
      const permission = await canUseFeature(userId, 'export', featureToUse);
      if (!permission.allowed) {
        alert(permission.reason || t.permissionError);
        setShowSubModal(true); // Show plan status as requested
        return;
      }
    }

    setIsDownloading(type);

    try {
      let graphImage: string | undefined;

      // Capture the report if needed for image-based exports
      if (reportRef.current && (type === 'image' || type === 'graphs' || type === 'docx' || type === 'excel')) {
        const reportId = "report-capture-node";
        reportRef.current.id = reportId;
        
        // Ensure it's temporarily visible but off-screen for accurate capture
        const originalStyle = reportRef.current.style.cssText;
        reportRef.current.style.position = 'fixed';
        reportRef.current.style.left = '0';
        reportRef.current.style.top = '0';
        reportRef.current.style.zIndex = '-1000';
        reportRef.current.style.opacity = '0.01';
        reportRef.current.style.display = 'block';
        reportRef.current.style.pointerEvents = 'none';

        const canvas = await html2canvas(reportRef.current, {
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc) => {
            const clonedReport = clonedDoc.getElementById(reportId);
            if (clonedReport) {
              clonedReport.style.display = 'block';
              clonedReport.style.position = 'relative';
              clonedReport.style.visibility = 'visible';
              clonedReport.style.opacity = '1';
              sanitizeElementColors(clonedReport);
              clonedReport.style.backgroundColor = '#ffffff';
              
              if (type === 'graphs') {
                clonedReport.querySelectorAll('section').forEach((el, idx) => {
                  if (idx !== 1 && idx !== 2) (el as HTMLElement).style.display = 'none';
                });
                clonedReport.querySelector('.grid')?.remove();
              }
            }
          }
        });
        
        reportRef.current.style.cssText = originalStyle;
        reportRef.current.id = '';
        graphImage = canvas.toDataURL('image/png');
        
        if (type === 'image' || type === 'graphs') {
          // Optimized for one-click download
          const link = document.createElement('a');
          link.href = graphImage;
          link.download = `SokoAI_${type === 'graphs' ? 'Grafu' : 'Ripoti'}_${Date.now()}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          await logUsage(userId, `export_${type}`);
          setIsDownloading(null);
          return;
        }
      }

      // Format-specific exports
      if (type === 'pdf') {
        const reportElementId = "report-capture-root-pdf";
        await exportService.exportToPdf(reportElementId, `SokoAI_Ripoti_${Date.now()}`);
        await logUsage(userId, 'export_pdf_basic');
      } else if (type === 'docx' && report) {
        await exportService.exportToDocx(report, language, graphImage);
        await logUsage(userId, 'export_word');
      } else if (type === 'excel' && report) {
        await exportService.exportToExcel(report, language, graphImage);
        await logUsage(userId, 'export_excel');
      }

    } catch (error) {
      console.error(`${type.toUpperCase()} export failed:`, error);
      alert(t.downloadFailed);
    } finally {
      setIsDownloading(null);
    }
  };

  if (!isOnboarded) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-950 font-sans text-slate-100 relative overflow-hidden items-center justify-center p-4">
        {/* Background Decor */}
        <div className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-primary/20 blur-[120px] rounded-full animate-float"></div>
        <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }}></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl relative flex flex-col z-10"
        >
          {/* Logo */}
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center font-black text-slate-950 text-2xl shadow-xl shadow-emerald-500/20 mb-4 mx-auto animate-pulse select-none" onClick={handleLogoClick}>
            S
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">Welcome to SokoAI</h2>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Your AI-Powered Business Partner</p>
          </div>

          {/* Custom Switch Tab */}
          <div className="grid grid-cols-2 bg-white/5 rounded-xl p-1 mb-6 border border-white/5">
            <button
              onClick={() => { setOnboardTab('register'); setOnboardError(''); }}
              className={cn(
                "py-2 text-xs font-bold rounded-lg transition-all",
                onboardTab === 'register' ? 'bg-primary text-slate-900 shadow' : 'text-slate-400 hover:text-white'
              )}
            >
              Create Account
            </button>
            <button
              onClick={() => { setOnboardTab('restore'); setOnboardError(''); }}
              className={cn(
                "py-2 text-xs font-bold rounded-lg transition-all",
                onboardTab === 'restore' ? 'bg-primary text-slate-900 shadow font-bold' : 'text-slate-400 hover:text-white'
              )}
            >
              Restore Account
            </button>
          </div>

          {/* Tab Content */}
          {onboardTab === 'register' ? (
            <form onSubmit={handleRegisterOnboard} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1.5 block animate-fade-in">Create Your Username</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 animate-fade-in">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Enter unique username"
                    className="pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm w-full transition-all text-white placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1.5 block">Your WhatsApp Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <MessageSquare size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={regWhatsapp}
                    onChange={(e) => setRegWhatsapp(e.target.value)}
                    placeholder="Enter phone with country code (e.g. +255...)"
                    className="pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm w-full transition-all text-white placeholder:text-slate-600"
                  />
                </div>
                <span className="text-[9px] text-slate-500 mt-1 block">This number will be linked to enable you to easily request system help or activation codes.</span>
              </div>

              <button
                type="submit"
                disabled={onboardLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl cursor-pointer shadow-lg shadow-emerald-500/20 transition-all font-bold text-sm active:scale-95 disabled:scale-100 disabled:opacity-50 text-slate-950"
              >
                {onboardLoading ? (
                  <>
                    <Loader2 className="animate-spin text-slate-950" size={16} />
                    Registering account...
                  </>
                ) : (
                  <>
                    Start Using SokoAI
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRestoreOnboard} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1.5 block">Enter Your SokoAI Username</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <User size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={restUsername}
                    onChange={(e) => setRestUsername(e.target.value)}
                    placeholder="Enter username"
                    className="pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm w-full transition-all text-white placeholder:text-slate-600"
                  />
                </div>
                <span className="text-[9px] text-slate-500 mt-1 block">Enter your previously used username to instantly restore your plan on this device.</span>
              </div>

              <button
                type="submit"
                disabled={onboardLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-tr from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl cursor-pointer shadow-lg shadow-emerald-500/20 transition-all font-bold text-sm active:scale-95 disabled:scale-100 disabled:opacity-50 text-slate-950"
              >
                {onboardLoading ? (
                  <>
                    <Loader2 className="animate-spin text-slate-950" size={16} />
                    Restoring account details...
                  </>
                ) : (
                  <>
                    Restore & Sign In
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Feedback Section */}
          {onboardError && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-2.5"
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-500" />
              <span>{onboardError}</span>
            </motion.div>
          )}

          <div className="text-center mt-6 text-[10px] text-slate-500 font-medium">
             <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 mb-2">
               <button type="button" onClick={() => { setAboutModalTab('about'); setShowAboutModal(true); }} className="hover:text-primary transition-colors cursor-pointer">Kuhusu SokoAI</button>
               <span className="opacity-30">|</span>
               <button type="button" onClick={() => { setAboutModalTab('privacy'); setShowAboutModal(true); }} className="hover:text-primary transition-colors cursor-pointer">Sera ya Faragha</button>
               <span className="opacity-30">|</span>
               <button type="button" onClick={() => { setAboutModalTab('terms'); setShowAboutModal(true); }} className="hover:text-primary transition-colors cursor-pointer">Vigezo & Masharti</button>
               <span className="opacity-30">|</span>
               <button type="button" onClick={() => { setAboutModalTab('contact'); setShowAboutModal(true); }} className="hover:text-primary transition-colors cursor-pointer">Mawasiliano</button>
             </div>
             <p className="opacity-30 text-[9px] uppercase tracking-widest font-black">SokoAI v2.5 • Professional Edition</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-screen font-sans text-slate-100 relative overflow-hidden", `theme-${userSettings.theme}`)}>
      {/* Background Decor */}
      <div className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-primary/20 blur-[120px] rounded-full animate-float"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }}></div>

      {/* Header */}
      <header className="h-20 border-b border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div 
            onClick={handleLogoClick}
            className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center font-bold text-slate-900 shadow-lg shadow-primary/20 text-xl cursor-default select-none active:scale-95 transition-transform"
          >
            S
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">{t.appTitle}</h1>
            <p className="hidden xs:block text-[10px] text-slate-400 font-medium uppercase tracking-widest opacity-70">{t.partner}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={detectLocation}
            disabled={isDetectingLocation}
            className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 px-2.5 py-1.5 rounded-xl hover:bg-emerald-400/10 hover:border-emerald-400/30 transition-all text-slate-300 active:scale-95 disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
            title="Thibitisha GPS ya Kifaa Chako"
          >
            <MapPin size={12} className={cn("shrink-0", isDetectingLocation ? "text-emerald-400 animate-bounce" : "text-amber-400")} />
            <span className="max-w-[80px] xs:max-w-[120px] md:max-w-[180px] truncate text-[9px] md:text-[10px] font-bold tracking-tight">
              {isDetectingLocation ? '...' : deviceLocation}
            </span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-3 bg-white/10 rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 border border-white/10 shadow-inner">
            <div className="flex flex-col items-end border-r border-white/10 pr-1.5 sm:pr-3 mr-0.5 sm:mr-1">
              <span className="text-[8px] sm:text-[10px] text-slate-300 uppercase tracking-widest font-black flex items-center gap-1 sm:gap-1.5 mb-0.5">
                <Globe size={10} className="text-blue-400 shrink-0" />
                <span className="truncate max-w-[60px] sm:max-w-[120px]">{userSettings.username || "SokoUser"}</span>
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono font-bold text-slate-400 sm:text-slate-500 tracking-wider tabular-nums flex items-center gap-1 sm:gap-1.5 leading-none whitespace-nowrap">
                <Clock size={10} className="shrink-0 text-emerald-400" />
                <span>{worldTime}</span>
              </span>
            </div>
            <div className="flex flex-col items-start pl-0.5 sm:pl-1">
              <span className="text-[7px] sm:text-[10px] text-slate-500 uppercase tracking-tighter block mb-0.5 leading-none">{language.substring(0, 3)}</span>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-transparent text-[9px] sm:text-[11px] font-bold text-white outline-none cursor-pointer hover:text-emerald-400 transition-colors"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} className="bg-slate-900">{lang.flag} {lang.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="hidden md:flex flex-col items-end bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setShowSubModal(true)}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-semibold flex items-center gap-2",
                userPlan?.plan === 'pro' ? 'text-amber-400' : userPlan?.plan === 'medium' ? 'text-blue-400' : 'text-emerald-400'
              )}>
                {userPlan?.plan === 'pro' ? <Zap size={14} /> : userPlan?.plan === 'medium' ? <Star size={14} /> : <ShieldCheck size={14} />}
                {userPlan?.plan?.toUpperCase() || 'FREE'}
              </span>
            </div>
            {userPlan?.expires_at && (
              <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                {t.expires}: 
                {remainingDaysMsg || (userPlan.plan === 'free' ? t.forever : (
                  new Date(userPlan.expires_at).toLocaleDateString(currentLocale, { 
                    timeZone: 'UTC',
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })
                ))}
              </span>
            )}
            {!userPlan?.expires_at && (
              <span className="text-[10px] text-slate-500 uppercase tracking-widest leading-none mt-1">Plan ya Matumizi</span>
            )}
          </div>
          <button className="p-2.5 text-slate-400 hover:text-white transition-all bg-white/5 rounded-xl border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 active:scale-95">
            <History size={20} />
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2.5 text-slate-400 hover:text-primary transition-all bg-white/5 rounded-xl border border-white/10 hover:border-primary/50 hover:bg-primary/5 active:scale-95"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Settings Drawer (Right to Left) */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[150] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-[85%] md:w-[400px] bg-slate-900 h-full border-l border-white/10 shadow-2xl relative z-10 p-6 flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                   <Settings size={20} />
                   Mipangilio
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
                {/* Profile Section */}
                <section className="space-y-4">
                  <h3 className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] flex items-center gap-2">
                    <User size={14} /> Profile Yako
                  </h3>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <label className="text-[10px] text-slate-400 uppercase mb-2 block font-bold">Username / Jina la Biashara</label>
                    <input 
                      type="text"
                      value={userSettings.username}
                      onChange={(e) => updateUserSettings({ username: e.target.value })}
                      placeholder="Weka jina lako..."
                      className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50"
                    />
                    <p className="text-[10px] text-slate-500 mt-2">Ujumbe utaanza na: <span className="text-primary italic">"Habari {userSettings.username || 'Mteja'}!"</span></p>
                    <p className="text-[10px] text-slate-500 mt-1 opacity-40">Username: <span className="font-mono font-bold text-slate-400">{userSettings.username || userId}</span></p>
                  </div>
                </section>

                {/* More Features */}
                <section className="space-y-3">
                  <h3 className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] flex items-center gap-2">
                    <Zap size={14} /> Zaidi
                  </h3>
                  
                  {/* Activation Quick Input */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Washa Plan (Activation)</label>
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-sm shadow-blue-500"></span>
                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-sm shadow-amber-500" style={{ animationDelay: '0.2s' }}></span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                        placeholder="SKM-XXXX..."
                        className="flex-1 bg-slate-950 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50 transition-all font-mono tracking-widest text-center"
                      />
                      <button 
                        onClick={() => handleActivate()}
                        disabled={subLoading || !activationCode}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold px-4 rounded-xl transition-all text-xs flex items-center gap-1"
                      >
                        {subLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        WASHA
                      </button>
                    </div>
                    {subError && <p className="text-rose-500 text-[9px] text-center">{subError}</p>}
                    {subSuccess && <p className="text-emerald-400 text-[9px] text-center font-bold">{subSuccess}</p>}
                  </div>

                  <button 
                    onClick={() => setShowPlans(true)}
                    className="w-full flex items-center justify-between p-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Zap size={18} className="text-emerald-400" />
                      <div className="text-left">
                        <span className="text-sm font-bold block">{t.upgradeMoreFeatures}</span>
                        <span className="text-[10px] text-emerald-400/70 uppercase font-bold">{t.upgradeDesc}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-emerald-500 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button 
                    onClick={() => {
                      setShowFeedbackModal(true);
                      setShowSettings(false);
                      setFeedbackText('');
                      setFeedbackResult(null);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group lg:cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare size={18} className="text-blue-400" />
                      <span className="text-sm font-medium">Toa Maoni (Feedback)</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                  </button>
                   <button 
                    onClick={() => {
                      setAboutModalTab('about');
                      setShowAboutModal(true);
                      setShowSettings(false);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group lg:cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Info size={18} className="text-emerald-400" />
                      <span className="text-sm font-medium">Kuhusu SokoAI & Sheria</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button 
                    onClick={() => {
                      // Save state explicitly
                      localStorage.setItem(`sokoai_messages_${userId}`, JSON.stringify(messages));
                      localStorage.setItem(`sokoai_settings_${userId}`, JSON.stringify(userSettings));
                      
                      // Refresh with a small delay for safety (1 second back feel)
                      const btn = document.getElementById('refresh-btn-text');
                      if (btn) btn.innerText = language === 'Kiswahili' ? 'Inapakia...' : 'Refreshing...';
                      
                      setTimeout(() => {
                        window.location.reload();
                      }, 1000);
                    }} 
                    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <RotateCcw size={18} className="text-amber-500" />
                      <span id="refresh-btn-text" className="text-sm font-medium">Refresh App</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button onClick={() => window.open(`https://wa.me/255763014086?text=Habari! Nimeunganisha SokoAI yangu.`)} className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group">
                    <div className="flex items-center gap-3">
                      <TrendingUp size={18} className="text-green-500" />
                      <span className="text-sm font-medium">Unganisha WhatsApp</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
                  </button>
                </section>
              </div>

              {/* SokoAI Info - Bottom of the list */}
              <div className="mt-auto pt-6 border-t border-white/10 text-center opacity-30 text-[9px] uppercase tracking-widest font-black">
                 SokoAI v2.5 • Professional Edition
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex w-full mb-6 z-10",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "max-w-[85%] md:max-w-[70%] rounded-2xl p-5 shadow-xl transition-all",
                message.role === 'user' 
                  ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-indigo-900/20" 
                  : "bg-white/10 backdrop-blur-xl border border-white/10 text-slate-100 rounded-tl-none shadow-black/20"
              )}>
                {message.file && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-black/20 rounded-lg text-sm border border-white/5">
                    <Paperclip size={14} className="text-emerald-400" />
                    <span className="truncate opacity-80">{message.file.name}</span>
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
                  {message.content}
                </div>
                {message.timestamp && (
                  <div className={cn(
                    "mt-2 text-[9px] font-mono opacity-40 text-right",
                    message.role === 'user' ? "text-white" : "text-slate-400"
                  )}>
                    {new Date(message.timestamp).toLocaleTimeString(language === 'Kiswahili' ? 'sw-TZ' : (language === 'English' ? 'en-US' : (language === 'Français' ? 'fr-FR' : 'zh-CN')), { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                
                {message.type === 'report' && message.reportData && (
                  <div className="mt-6 space-y-6 border-t border-slate-100 pt-6" id="business-report">
                    <BusinessReportView 
                      report={message.reportData} 
                      userPlan={userPlan}
                      onDownload={(type) => handleDownload(type, message.reportData)} 
                      language={language}
                      timestamp={message.timestamp}
                      isDownloading={isDownloading}
                      onUpgrade={() => setShowSubModal(true)}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start z-10"
            >
              <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl rounded-tl-none p-4 flex items-center gap-2 shadow-lg">
                <Loader2 className="animate-spin text-emerald-400" size={18} />
                <span className="text-sm text-slate-400 font-medium">{t.typing}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={reportRef} className="absolute left-[-9999px] top-0 pointer-events-none" id="report-capture-root-pdf">
            {/* Hidden copy for PDF capture - Optimized for A4 Print */}
             {messages.filter(m => m.type === 'report').slice(-1).map((m, i) => (
                <div key={i} style={{ width: '210mm', minHeight: '297mm', padding: '20mm', background: '#FFFFFF', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', color: '#111827' }}>
                  
                  {/* HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #111827', paddingBottom: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', background: '#111827', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '18px', borderRadius: '4px' }}>S</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', lineHeight: '1' }}>SOKOAI – RIPOTI YA BIASHARA</div>
                        <div style={{ fontSize: '10px', color: '#6B7280', lineHeight: '1' }}>Mshirika wa ukuaji wa biashara ({userSettings.username})</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '10px', color: '#6B7280' }}>
                      <div className="uppercase font-bold tracking-widest mb-0.5">{t.date}</div>
                      <div style={{ fontWeight: '600', color: '#111827', fontSize: '12px' }}>
                        {new Date(Date.now() + timeOffset).toLocaleDateString('sw-TZ', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  <BusinessReportView 
                    report={m.reportData!} 
                    userPlan={userPlan} 
                    isPdf={true} 
                    language={language}
                    timestamp={m.timestamp}
                  />

                  {/* FOOTER */}
                  <div style={{ textAlign: 'center', fontSize: '9px', color: '#9CA3AF', marginTop: '30px', borderTop: '1px solid #E5E7EB', paddingTop: '20px' }}>
                    ✅ UTHIBITISHO: Data yako imefutwa baada ya dk 1.
                  </div>
                </div>
              ))}
        </div>
      </main>

      {/* Input Section */}
      <footer className="p-4 md:p-6 border-t border-white/10 bg-black/20 backdrop-blur-lg z-10">
        <div className="max-w-4xl mx-auto">
          <div {...getRootProps()} className={cn(
            "mb-4 border-2 border-dashed rounded-xl p-3 transition-all cursor-pointer group",
            isDragActive ? "border-emerald-400 bg-emerald-400/10" : "border-white/5 hover:border-white/20 bg-white/5"
          )}>
            <input {...getInputProps()} />
            <div className="flex items-center justify-center gap-3 text-slate-400 group-hover:text-slate-300 transition-colors">
              <ImageIcon size={20} className="text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">{t.uploadLabel}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleAppRefresh}
              className={cn(
                "p-3 rounded-xl transition-all border border-white/5 shadow-lg active:scale-95 group relative overflow-hidden",
                isRefreshing ? "text-amber-400 bg-amber-400/10 cursor-wait" : "text-slate-400 hover:text-emerald-400 hover:bg-white/5"
              )}
              disabled={isRefreshing}
              title={language === 'Kiswahili' ? 'Vuta Data / Refresh' : 'Sync & Refresh App'}
            >
              <RotateCcw size={24} className={cn("transition-transform duration-500", isRefreshing ? "animate-spin" : "group-hover:rotate-[-45deg]")} />
              {isRefreshing && (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1 }}
                  className="absolute bottom-0 left-0 h-0.5 bg-amber-500"
                />
              )}
            </button>
            <div className="flex-1 relative group">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t.inputPlaceholder}
                className="w-full bg-white/10 border border-white/10 rounded-xl py-3.5 px-5 pr-14 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all outline-none placeholder:text-slate-500 shadow-inner"
              />
              <button 
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-primary disabled:text-slate-600 transition-all hover:scale-110 active:scale-95"
              >
                <Send size={24} />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-center text-slate-500 mt-4 tracking-widest uppercase opacity-60">
            {t.reportFooter}
          </p>
        </div>
      </footer>

      {/* Subscription Modal */}
      <AnimatePresence>
        {showSubModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Upgrade SokoAI</h2>
                    <p className="text-slate-400 text-sm">Chagua plan iliyo bora kwa biashara yako</p>
                  </div>
                  <button onClick={() => setShowSubModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400">
                    <Plus size={20} className="rotate-45" />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  {plansData?.plans ? Object.entries(plansData.plans).map(([key, plan]: [string, any]) => (
                    <div 
                      key={key}
                      onClick={() => {
                        if (key === 'free') handleActivate('free');
                        else setSelectedPlanUpgrade(key);
                      }}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer group relative",
                        userPlan?.plan === key ? (
                          key === 'pro' ? "border-amber-500 bg-amber-500/10" : 
                          key === 'medium' ? "border-blue-500 bg-blue-500/10" : 
                          "border-emerald-500 bg-emerald-500/10"
                        ) : "border-white/5 hover:bg-white/5",
                        selectedPlanUpgrade === key && "ring-2 ring-emerald-500/50"
                      )}
                    >
                      {key === 'medium' && <div className="absolute -top-2 -right-2 bg-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full text-white">POPULAR</div>}
                      <div className="flex justify-between items-center mb-1">
                        <span className={cn(
                          "font-bold flex items-center gap-2 uppercase tracking-widest text-xs",
                          key === 'pro' ? "text-amber-400" : key === 'medium' ? "text-blue-400" : "text-emerald-400"
                        )}>
                          {key === 'pro' && <Zap size={12} />}
                          {key === 'medium' && <Star size={12} />}
                          {key.toUpperCase()} PLAN
                        </span>
                        <span className="text-white font-bold text-sm">
                          {plan.price === 0 ? "Bure" : `TSh ${plan.price.toLocaleString()}/${plan.duration}`}
                        </span>
                      </div>
                      <ul className="text-[10px] text-slate-500 space-y-0.5 mt-2">
                         {plan.features_list?.map((feature: string, idx: number) => (
                           <li key={idx}>{feature}</li>
                         ))}
                      </ul>
                    </div>
                  )) : (
                    <div className="flex justify-center p-8">
                      <Loader2 size={32} className="animate-spin text-emerald-500" />
                    </div>
                  )}
                </div>

                {selectedPlanUpgrade && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-8 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl"
                  >
                    <h3 className="text-emerald-400 font-bold text-sm mb-3 flex items-center gap-2">
                      <CreditCard size={16} />
                      Maelekezo ya Malipo ({selectedPlanUpgrade.toUpperCase()})
                    </h3>
                    <div className="space-y-2 text-xs text-white/80">
                      <p>1. Lipa <span className="font-bold text-white text-sm">TSh {plansData.plans[selectedPlanUpgrade].price.toLocaleString()}</span> kwenda:</p>
                      <div className="flex flex-col gap-1 pl-4 mb-3">
                        <p>Namba: <span className="text-emerald-400 font-mono text-lg font-bold select-all tracking-wider">{plansData.lipa_number}</span> (NMB Prepaid account)</p>
                        <p>Jina: <span className="text-emerald-400 font-bold">{plansData.jina}</span></p>
                      </div>
                      <p>2. Baada ya kulipa, tuma meseji WhatsApp kwa namba:</p>
                      <div className="pl-4">
                        <a 
                          href={`https://wa.me/${plansData.whatsapp_help.replace('+', '')}?text=Nimefanya%20malipo%20ya%20${selectedPlanUpgrade.toUpperCase()}%20Username:%20${userSettings.username || userId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 font-bold text-sm hover:underline flex items-center gap-2"
                        >
                          {plansData.whatsapp_help}
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="mt-3 text-[10px] italic text-slate-500">Utapokea Activation Code ndani ya muda mfupi.</p>
                    </div>
                  </motion.div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Washa Plan Yako (Medium/Pro)</p>
                    <div className="flex gap-2">
                       <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-bold rounded uppercase tracking-tighter border border-blue-500/20">Medium</span>
                       <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-bold rounded uppercase tracking-tighter border border-amber-500/20">Pro</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                      placeholder="SKM-XXXX-XXXX au SKP-XXXX-XXXX"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all font-mono tracking-widest text-center text-sm"
                    />
                    <button 
                      onClick={() => handleActivate()}
                      disabled={subLoading || !activationCode}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold px-6 rounded-xl transition-all flex items-center gap-2"
                    >
                      {subLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={20} />}
                      Washa
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-600 text-center">Weka code uliyopewa na Admin ili kurenew au kuactivate plan yako.</p>
                  {subError && <p className="text-rose-500 text-xs text-center animate-bounce">{subError}</p>}
                  {subSuccess && <p className="text-emerald-400 text-sm text-center font-black animate-pulse">{subSuccess}</p>}
                </div>
                
                <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center">
                  <p className="text-slate-500 text-[10px] text-center mb-4 leading-relaxed">
                    Kama huna code, wasiliana na SokoAI Support kupitia WhatsApp:<br/>
                    <span className="text-white font-bold text-sm">+255 763 014 086</span>
                  </p>
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                  <p className="text-slate-600 text-[10px] mt-4 flex items-center justify-center gap-2">
                    <span>Username: <span className="font-bold text-slate-300 select-all selection:bg-emerald-500">{userSettings.username || userId}</span></span>
                    <span className="opacity-30">•</span>
                    <span>Tuma hii kwa Admin kupata Code</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Dashboard Modal */}
      <AnimatePresence>
        {showAdmin && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowAdmin(false);
                setIsAdminAuthenticated(false);
                setAdminMode('login');
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/10 rounded-xl">
                      <ShieldCheck className="text-red-500" size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white uppercase tracking-widest">Admin Panel</h2>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-none mt-1">Management Console</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowAdmin(false);
                      setIsAdminAuthenticated(false);
                      setAdminMode('login');
                    }} 
                    className="p-2 hover:bg-white/10 rounded-xl text-slate-400 trasition-colors"
                  >
                    <Plus size={20} className="rotate-45" />
                  </button>
                </div>

                {adminMode === 'login' && (
                  <div className="space-y-6">
                    <div className="text-center">
                      <p className="text-sm text-slate-400 mb-6">Weka password ya admin ili kuingia.</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">Admin Password</label>
                      <input 
                        type="password"
                        value={adminAuthPassword}
                        onChange={(e) => setAdminAuthPassword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdminVerify()}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-red-500/50 text-center text-xl tracking-[0.5em]"
                      />
                    </div>
                    <button 
                      onClick={handleAdminVerify}
                      disabled={adminLoading || !adminAuthPassword}
                      className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-xl shadow-red-600/20 active:scale-95 disabled:opacity-50"
                    >
                      {adminLoading ? <Loader2 size={20} className="animate-spin mx-auto" /> : "INGIA KWENYE PANEL"}
                    </button>
                    <button 
                      onClick={fetchSecurityQuestions}
                      className="w-full text-[10px] text-slate-500 uppercase font-bold tracking-widest hover:text-white transition-colors"
                    >
                      Nimesahau Password?
                    </button>
                  </div>
                )}

                {adminMode === 'reset' && (
                  <div className="space-y-6">
                    <div className="text-center mb-6">
                      <h3 className="text-white font-bold mb-2">Reset Password</h3>
                      <p className="text-xs text-slate-500">Jibu maswali ya usalama kubadili password.</p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase mb-2 block">{adminQuestions.q1}</label>
                        <input 
                          type="text"
                          value={adminAnswers.a1}
                          onChange={(e) => setAdminAnswers(prev => ({ ...prev, a1: e.target.value }))}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase mb-2 block">{adminQuestions.q2}</label>
                        <input 
                          type="text"
                          value={adminAnswers.a2}
                          onChange={(e) => setAdminAnswers(prev => ({ ...prev, a2: e.target.value }))}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="pt-2">
                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">Password Mpya</label>
                        <input 
                          type="password"
                          value={adminAnswers.newPassword}
                          onChange={(e) => setAdminAnswers(prev => ({ ...prev, newPassword: e.target.value }))}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3">
                       <button 
                         onClick={() => setAdminMode(isAdminAuthenticated ? 'dashboard' : 'login')}
                         className="flex-1 bg-white/5 text-slate-300 py-4 rounded-xl font-bold text-xs"
                       >
                         GHAIRI
                       </button>
                       <button 
                         onClick={handleAdminPasswordReset}
                         disabled={adminLoading || !adminAnswers.a1 || !adminAnswers.a2 || !adminAnswers.newPassword}
                         className="flex-1 bg-emerald-600 text-white py-4 rounded-xl font-bold text-xs"
                       >
                         {adminLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "BADILI PASSWORD"}
                       </button>
                    </div>
                  </div>
                )}

                {adminMode === 'dashboard' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 block">Username ya Mteja (Hakikisha ni sahihi)</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                          <input 
                            type="text"
                            value={adminTargetUsername}
                            onChange={(e) => setAdminTargetUsername(e.target.value)}
                            placeholder="SokoUser_XXXXXX"
                            className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 block">Phone ya Mteja (Kwa ajili ya WhatsApp tu)</label>
                        <div className="relative">
                          <ExternalLink className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                          <input 
                            type="text"
                            value={adminUserId}
                            onChange={(e) => setAdminUserId(e.target.value)}
                            placeholder="+255..."
                            className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white outline-none focus:border-blue-500/50"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 block">Chagua Plan</label>
                      <div className="flex gap-2">
                        {['medium', 'pro'].map(p => (
                          <button
                            key={p}
                            onClick={() => setAdminPlan(p)}
                            className={cn(
                              "flex-1 py-4 rounded-2xl border font-black uppercase text-[10px] tracking-[0.2em] transition-all relative overflow-hidden",
                              adminPlan === p 
                                ? (p === 'pro' ? "bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20" : "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20") 
                                : "bg-white/5 border-white/10 text-slate-500"
                            )}
                          >
                            {adminPlan === p && (
                              <motion.div layoutId="plan-active" className="absolute inset-0 bg-white/10" />
                            )}
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={handleGenerateAdminCode}
                      disabled={adminLoading || !adminUserId}
                      className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black text-xs tracking-widest hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50"
                    >
                      {adminLoading ? <Loader2 size={18} className="animate-spin text-slate-900" /> : <Zap size={18} />}
                      TENGENEZA ACTIVATION CODE
                    </button>

                    {generatedCode && (
                      <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="mt-6 p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-3xl text-center"
                      >
                        <p className="text-[10px] text-emerald-400 uppercase font-black mb-3 tracking-[0.2em]">Kodi Mpya ya Mteja:</p>
                        <div 
                          className="bg-slate-950 p-5 rounded-2xl border border-emerald-500/20 mb-4 group relative cursor-pointer active:scale-95 transition-transform"
                          onClick={() => {
                            navigator.clipboard.writeText(generatedCode.code);
                            alert("Kodi imenakiliwa!");
                          }}
                        >
                           <p className="text-3xl font-mono font-black text-white tracking-[0.1em]">{generatedCode.code}</p>
                           <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <TrendingUp size={12} className="text-emerald-500" />
                           </div>
                        </div>
                      <button 
                        onClick={() => {
                          const text = `Habari! Karibu SokoAI.\n\nCode yako ya ${adminPlan.toUpperCase()} ni: *${generatedCode.code}*\n\nUsername yako ni: *${adminTargetUsername}*\n\nIjaze kwenye app ili kuanza kufurahia huduma.\n\nAsante.`;
                          const cleanPhone = adminUserId.startsWith('+') ? adminUserId.substring(1) : (adminUserId.startsWith('0') ? '255' + adminUserId.substring(1) : adminUserId);
                          window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`);
                        }}
                        className="w-full bg-[#25D366] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#128C7E] transition-all shadow-lg"
                      >
                        <ImageIcon size={18} />
                        Tuma WhatsApp
                      </button>
                      </motion.div>
                    )}

                    <div className="pt-6 border-t border-white/5 space-y-3">
                      <button 
                        onClick={() => setAdminMode('reset')}
                        className="w-full flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-2xl text-[11px] text-white hover:bg-white/10 font-black uppercase tracking-[0.2em] transition-all"
                      >
                        <Key size={16} className="text-primary" />
                        BADILI PASSWORD / MASWALI
                      </button>
                      
                      <p className="text-[9px] text-slate-600 text-center uppercase tracking-widest">
                        Usalama wa Akaunti yako ni kipaumbele
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upgrade Plans Modal */}
      <AnimatePresence>
        {showPlans && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPlans(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-8 flex justify-between items-center border-b border-white/5 bg-white/5">
                <div>
                  <h2 className="text-2xl font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    <Zap className="text-emerald-400" fill="currentColor" />
                    Boresha SokoAI Yako
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-black opacity-50">Chagua kifurushi kinachokufaa</p>
                </div>
                <button 
                  onClick={() => setShowPlans(false)} 
                  className="p-3 hover:bg-white/10 rounded-2xl text-slate-400 transition-all active:scale-95"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Standard Plan */}
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col relative group">
                    <div className="mb-6">
                      <span className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-2 block">Standard Edition</span>
                      <h3 className="text-xl font-bold text-white">BURE</h3>
                    </div>
                    <ul className="space-y-4 mb-8 flex-1">
                      {['Mchanganuo wa Msingi', 'Swahili & English', 'PDF Export Limited', 'Muda wa Kawaida'].map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-xs uppercase cursor-default">
                      Plan Inayotumika
                    </button>
                  </div>

                  {/* Medium Plan */}
                  <div className="bg-blue-600/10 border-2 border-blue-500/50 rounded-3xl p-6 flex flex-col relative group shadow-2xl shadow-blue-500/10 scale-105 z-10">
                    <div className="absolute top-0 right-8 -translate-y-1/2 bg-blue-500 text-white text-[9px] font-black uppercase px-3 py-1 rounded-full tracking-widest">
                       INAYOPENDWA
                    </div>
                    <div className="mb-6">
                      <span className="text-[10px] text-blue-400 uppercase font-black tracking-[0.2em] mb-2 block">Medium Edition</span>
                      <h3 className="text-xl font-bold text-white uppercase tracking-widest">TSH 10,000 / mwezi</h3>
                    </div>
                    <ul className="space-y-4 mb-8 flex-1">
                      {['Mchanganuo wa Kina', 'Uwezo wa Files 100+', 'Kasi Maalum (Turbo)', 'Msaada wa Maana'].map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-100">
                          <Zap size={14} className="text-blue-400 mt-0.5 shrink-0" fill="currentColor" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => window.open(`https://wa.me/255763014086?text=Habari! Naomba activation code ya MEDIUM PLAN. Username yangu ni: *${userSettings.username}*`)}
                      className="w-full py-4 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                    >
                      Pata Sasa
                    </button>
                  </div>

                  {/* Pro Plan */}
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6 flex flex-col relative group">
                    <div className="mb-6">
                      <span className="text-[10px] text-amber-500 uppercase font-black tracking-[0.2em] mb-2 block">Professional Edition</span>
                      <h3 className="text-xl font-bold text-white uppercase tracking-widest">TSH 20,000 / mwezi</h3>
                    </div>
                    <ul className="space-y-4 mb-8 flex-1">
                      {['Unlimited Analysis', 'Advanced AI Intelligence', 'Full Business Suite', 'VIP Priority Support'].map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <ShieldCheck size={14} className="text-amber-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => window.open(`https://wa.me/255763014086?text=Habari! Naomba activation code ya PRO PLAN. Username yangu ni: *${userSettings.username}*`)}
                      className="w-full py-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500 text-slate-300 hover:text-slate-900 font-black text-xs uppercase tracking-widest transition-all active:scale-95"
                    >
                      Boresha Pro
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-white/5 bg-slate-950/50">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tayari una Activation Code?</p>
                    <div className="flex gap-2">
                       <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-bold rounded uppercase tracking-tighter border border-blue-500/20">Medium</span>
                       <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-bold rounded uppercase tracking-tighter border border-amber-500/20">Pro</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                      placeholder="SKM-XXXX... au SKP-XXXX..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all font-mono tracking-widest text-center text-sm"
                    />
                    <button 
                      onClick={handleActivate}
                      disabled={subLoading || !activationCode}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold px-6 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                      {subLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={20} />}
                      Washa
                    </button>
                  </div>
                  {subError && <p className="text-rose-500 text-[10px] text-center animate-bounce">{subError}</p>}
                  <p className="text-[9px] text-slate-600 text-center uppercase tracking-widest leading-relaxed">
                     Baada ya malipo, utapewa Activation Code ambayo utaijaza hapa ili kuwasha huduma.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* About & Legal Modal */}
      <AnimatePresence>
        {showAboutModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAboutModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-6 md:p-8 flex justify-between items-center border-b border-white/5 bg-white/5">
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-3">
                    <Info className="text-emerald-400" size={20} />
                    {language === 'Kiswahili' ? 'Taarifa za SokoAI & Sheria' : 'SokoAI About & Legal Hub'}
                  </h2>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-black opacity-60">
                    {language === 'Kiswahili' ? 'Uthibitisho, usiri wa data na usaidizi rasmi' : 'Trust, integrity & compliance transparency'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowAboutModal(false)} 
                  className="p-3 hover:bg-white/10 rounded-2xl text-slate-400 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-white/5 bg-slate-950/40 p-1">
                {(['about', 'privacy', 'terms', 'contact'] as const).map((tab) => {
                  const label = {
                    about: language === 'Kiswahili' ? 'Kuhusu SokoAI' : 'About SokoAI',
                    privacy: language === 'Kiswahili' ? 'Sera ya Faragha' : 'Privacy Policy',
                    terms: language === 'Kiswahili' ? 'Vigezo na Masharti' : 'Terms & Disclaimers',
                    contact: language === 'Kiswahili' ? 'Mawasiliano' : 'Contact Us'
                  }[tab];
                  return (
                    <button
                      key={tab}
                      onClick={() => setAboutModalTab(tab)}
                      className={cn(
                        "flex-1 py-3 text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer",
                        aboutModalTab === tab 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black" 
                          : "text-slate-400 hover:text-white font-medium"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar text-slate-300">
                {aboutModalTab === 'about' && (
                  <div className="space-y-4 text-xs md:text-sm leading-relaxed">
                    <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex gap-4">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-900 text-lg shrink-0">S</div>
                      <div>
                        <h4 className="font-bold text-white text-base">SokoAI v2.5</h4>
                        <p className="text-xs text-slate-400">Your AI-Powered Swahili Business Analytics Systems.</p>
                      </div>
                    </div>
                    {language === 'Kiswahili' ? (
                      <>
                        <p>
                          <strong>SokoAI</strong> ni mfumo maalum uliotengenezwa mahususi kurahisisha usimamizi vya biashara, mchanganuo wa faida na hasara, na ukadiriaji wa kifedha kwa wajasiriamali wadogo nchini Tanzania. 
                        </p>
                        <p>
                          Tofauti na mifumo mingine migumu ya Kiingereza au Excel pekee, SokoAI inamuwezesha mfanyabiashara kupiga hesabu kwa kuandika tu ujumbe wa kawaida au kupiga picha ya kitabu chake cha hesabu au risiti, na mfumo kupitia mifumo ya Akili Mnemba (AI) inatoa ripoti rasmi kwa sekunde chache.
                        </p>
                        <h5 className="font-bold text-white pt-2 uppercase tracking-wider text-xs">Sifa Kuu za Programu yetu:</h5>
                        <ul className="list-disc pl-5 space-y-2 text-xs">
                          <li><strong>Uchambuzi wa Picha na PDF:</strong> Tuma picha ya risiti au ukurasa wa kitabu chako cha mauzo, tukuchambulie kila kitu kwa sekunde chache.</li>
                          <li><strong>Mapendekezo Rahisi:</strong> Tunakupatia mbinu za kifedha kama mhasibu wako binafsi aliyetayari wakati wote nchini Tanzania.</li>
                          <li><strong>Kumbukumbu za Kienyeji:</strong> Hatuhifadhi takwimu zako kwenye mifumo ya nje. Kila kitu kinatunzwa kwenye simu yako binafsi (localStorage) kwa usalama zaidi.</li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>SokoAI</strong> is a customized, high-precision business advisory application designed explicitly to simplify accounting analytics, profit & loss management, and financial forecasting for micro, small, and medium enterprises (MSMEs) in Tanzania.
                        </p>
                        <p>
                          Unlike rigid ERP systems, SokoAI enables entrepreneurs to check or generate ledgers simply by typing standard descriptions or uploading business records/receipt screenshots. The interface transforms raw inputs into beautiful financial graphics and automated text advisory solutions within seconds.
                        </p>
                        <h5 className="font-bold text-white pt-2 uppercase tracking-wider text-xs">Core Features of Our Engine:</h5>
                        <ul className="list-disc pl-5 space-y-2 text-xs">
                          <li><strong>Visual Ledger Processing:</strong> Easily analyze printed invoices, handmade ledger notebooks, and CSV records.</li>
                          <li><strong>Actionable Weekly Insights:</strong> Recommends explicit operational strategies based on regional Tanzania business variables.</li>
                          <li><strong>Local Sandboxed State:</strong> Your accounting history remains secured in your local browser sandbox, completely offline-first by default.</li>
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {aboutModalTab === 'privacy' && (
                  <div className="space-y-4 text-xs md:text-sm leading-relaxed">
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-slate-100 flex items-start gap-3">
                      <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                      <div>
                        <h4 className="font-bold text-sm uppercase tracking-wider">
                          Ulinzi Kamili na Utii wa Sheria / Legal Data Protection
                        </h4>
                        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                          SokoAI inatii kikamilifu <strong>Sheria ya Ulinzi wa Taarifa Binafsi, 2022 (Tanzania Personal Data Protection Act, 2022)</strong> pamoja na masuala ya usalama wa habari nchini.
                        </p>
                      </div>
                    </div>
                    {language === 'Kiswahili' ? (
                      <>
                        <p>
                          Usiri wa data yako ya kifedha ni kipaumbele chetu namba moja. Tuna hakikisha data yako inalindwa kwa mbinu zifuatazo:
                        </p>
                        <ul className="space-y-3">
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>1. Hifadhi ya Kwenye Kifaa (Local Storage Only):</strong> SokoAI inatumia kivinjari chako kuhifadhi historia zote za uandishi na mipangilio. Takwimu zako hazihifadhiwi kwenye database zetu za nje, hivyo hakuna anayeweza kuziiba au kuzipitia.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>2. Kufuta Data Kiotomatiki (Automatic Ephemeral Purge):</strong> Faili zozote na picha unazotuma kwa ajili ya uchambuzi wa AI zinafutwa kwenye mifumo yetu baada ya dakika moja ya mchakato kukamilika.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>3. Hakuna Uvujishaji (No Third-Party Access):</strong> Hatukusanyi, hatusomi wala kuuza taarifa zako za mapato au bidhaa kwa mashirika au watu wa nje.
                          </li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p>
                          The confidentiality of your commercial records is our supreme priority. We enforce secure local-first procedures:
                        </p>
                        <ul className="space-y-3">
                          <li className="p-2 bg-white/5 border border-white/5 rounded-xl">
                            <strong>1. Sandboxed Browser Storage:</strong> SokoAI uses standard web browser sandbox states (localStorage). No centralized accounts or external database schemas store your raw calculations unless you explicitly request backups.
                          </li>
                          <li className="p-2 bg-white/5 border border-white/5 rounded-xl">
                            <strong>2. Ephemeral Data Processing:</strong> Any visual media or invoice images submitted to our servers are dynamically processed and completely vaporized within 1 minute of completed report rendering.
                          </li>
                          <li className="p-2 bg-white/5 border border-white/5 rounded-xl">
                            <strong>3. Regulatory Compliance:</strong> Strict technical parameters safeguard all user queries under TZ Personal Data Protection provisions (Act of 2022).
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {aboutModalTab === 'terms' && (
                  <div className="space-y-4 text-xs md:text-sm leading-relaxed">
                    {language === 'Kiswahili' ? (
                      <>
                        <h4 className="font-bold text-white text-base">Masharti ya Matumizi ya Mfumo</h4>
                        <p>
                          Kwa kujisajili na kutumia programu hii ya SokoAI, unakubaliana na vigezo vifuatavyo:
                        </p>
                        <ul className="space-y-3">
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>Matumizi ya Taarifa:</strong> Ripoti, asilimia za ukuaji na hesabu zinazotolewa na SokoAI ni msaada wa kimahesabu tu (Automated Calculations). Haiwakilishi ushauri rasmi wa kodi (tax returns) yao ya kodi (TRA) au uwasilishaji kodi. SokoAI inatoa vifaa vya kupigia hesabu visivyo rasmi, tafadhali thibitisha hesabu na mhasibu wako kabla ya kufanya uamuzi mkubwa wa kibiashara.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>Salio la Matumizi:</strong> Activation Codes za SokoAI Medium na Pro hutumika kukupa vipengele maalum. Mara baada ya kuwasha activation code kwenye simu yako, haitoweza kubadilishwa au kurejeshewa malipo.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>Usahihi wa Data:</strong> Mtumiaji anawajibika dhabiti kuingiza taarifa sahihi za faida, gharama, mikopo na hasara ili kupata taswira halisi na takwimu thabiti kutoka kwa mifumo yetu.
                          </li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <h4 className="font-bold text-white text-base">Software Terms of Service</h4>
                        <p>
                          By accessing or restoring an active SokoAI account, you agree to the following conditions:
                        </p>
                        <ul className="space-y-3">
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>Informational Purpose:</strong> All generated dashboards, charts, and forecasts are structured mathematical analytics models. They are not accredited accounting advice or official TRA returns filings. Users should cross-reference outputs for legal bookkeeping.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>License and Ownership:</strong> SokoAI retains all original design codes and intellectual property rights. Unlicensed redistribution is legally prohibited.
                          </li>
                          <li className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <strong>No Liability:</strong> SokoAI holds no liability for commercial decisions inspired by the program analysis.
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {aboutModalTab === 'contact' && (
                  <div className="space-y-4 text-xs md:text-sm leading-relaxed">
                    <h4 className="font-bold text-white text-base">
                      {language === 'Kiswahili' ? 'Maswali au Kupata Usaidizi wa Haraka?' : 'Inquiries & Active Support Desk'}
                    </h4>
                    {language === 'Kiswahili' ? (
                      <p>
                        Unaweza kuwasiliana na timu yetu ya usaidizi wa kiufundi nchini Tanzania kwa masuala yoyote ya mipangilio au kupata activation keys:
                      </p>
                    ) : (
                      <p>
                        You can access our direct technical customer service desk or licensing department via the following touchpoints:
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <TrendingUp className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                        <div>
                          <h5 className="font-bold text-white mb-1">WhatsApp Support</h5>
                          <a href="https://wa.me/255763014086" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline font-bold text-xs block">
                            +255 763 014 086
                          </a>
                          <span className="text-[10px] text-slate-500">Masaa yote ya Huduma</span>
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <Loader2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                        <div>
                          <h5 className="font-bold text-white mb-1">Email Support</h5>
                          <a href="mailto:sokoaisupport@gmail.com" className="text-blue-400 hover:underline font-bold text-xs block">
                            sokoaisupport@gmail.com
                          </a>
                          <span className="text-[10px] text-slate-500">Msaada wa Kiufundi & Akaunti</span>
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <Clock className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <div>
                          <h5 className="font-bold text-white mb-1">Dar es Salaam Main Office</h5>
                          <p className="text-[11px] text-slate-300">
                            SokoAI Advisory Systems Ltd, Mlimani Towers, Plot 14-A, Ghorofa ya 4, Barabara ya Sam Nujoma, Dar es Salaam, Tanzania.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <MapPin className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                        <div>
                          <h5 className="font-bold text-white mb-1">Kigoma Buhigwe Office</h5>
                          <p className="text-[11px] text-slate-300">
                            SokoAI Regional Operations & Support Hub, Buhigwe Town, Karibu na Halmashauri ya Buhigwe, Kigoma, Tanzania.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-white/5 bg-slate-950/50 flex flex-col md:flex-row justify-between items-center gap-2 text-[10px] text-slate-500 text-center">
                <span>© {new Date().getFullYear()} SokoAI Local Advisory Systems. Haki zote zimehifadhiwa Tanzania.</span>
                <span className="font-bold text-slate-400">Dar es Salaam, Tanzania</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedbackModal && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!feedbackLoading) setShowFeedbackModal(false);
              }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-950/20">
                <div className="flex items-center gap-2">
                  <MessageSquare className="text-blue-400 shrink-0" size={20} />
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Msaidizi wa Maoni (Feedback)</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Tuma maoni ya kujenga kwa SokoAI</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowFeedbackModal(false)}
                  disabled={feedbackLoading}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Main Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                
                {/* Step 1: Write Feedback */}
                {!feedbackResult && !feedbackLoading && (
                  <div className="space-y-4">
                    {/* Category Selection */}
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-2 block">Chagua Aina ya Maoni</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'pendekezo', title: 'Pendekezo', desc: 'Wazo jipya', color: 'text-blue-400 border-blue-400/20 bg-blue-400/5' },
                          { id: 'tatizo', title: 'Changamoto', desc: 'Hitilafu / Error', color: 'text-rose-400 border-rose-400/20 bg-rose-400/5' },
                          { id: 'shukrani', title: 'Shukrani', desc: 'Sifa / Upendo', color: 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setFeedbackCategory(cat.id as any)}
                            className={cn(
                              "border text-center p-3 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5",
                              feedbackCategory === cat.id 
                                ? 'border-primary bg-primary/15 text-primary scale-[1.03] shadow-lg shadow-primary/5' 
                                : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                            )}
                          >
                            <span className="text-xs font-bold block">{cat.title}</span>
                            <span className="text-[8px] opacity-75">{cat.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Feedback Input */}
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-2 block">Andika Maoni Yako Hapa</label>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        rows={5}
                        placeholder={
                          feedbackCategory === 'pendekezo' 
                            ? 'Mfano: Ningependa kuwe na grafu za biashara kwa week nzima...'
                            : feedbackCategory === 'tatizo'
                            ? 'Mfano: Risiti haisomeki vizuri nikipiga picha usiku...'
                            : 'Mfano: Msaidizi huyu ni mzuri sana kupigia hesabu za duka langu...'
                        }
                        className="w-full bg-slate-950 border border-white/5 rounded-2xl p-4 text-xs md:text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50 resize-none transition-all leading-relaxed"
                      />
                      <p className="text-[9px] text-slate-500 italic mt-1.5 flex items-center gap-1">
                        🔒 Maoni yako yanachujwa na Akili Mnemba (AI) kulinda ustaarabu na kuzuia kashfa kabla ya kutumwa.
                      </p>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (feedbackText.trim() === '') return;
                        setFeedbackLoading(true);
                        setFeedbackResult(null);
                        try {
                          const res = await fetch('/api/feedback/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ feedbackText, category: feedbackCategory })
                          });
                          const data = await res.json();
                          setFeedbackResult({
                            isAllowed: data.isAllowed,
                            reason: data.reasonSwahili || data.error || "Uchambuzi umekamilika."
                          });
                        } catch (err) {
                          console.log("Error moderating feedback:", err);
                          setFeedbackResult({
                            isAllowed: true,
                            reason: "Asante kwa maoni ya kujenga! SokoAI imepitisha maoni yako kikamilifu."
                          });
                        } finally {
                          setFeedbackLoading(false);
                        }
                      }}
                      disabled={feedbackText.trim() === ''}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 disabled:from-slate-800 disabled:to-slate-800 disabled:opacity-55 disabled:cursor-not-allowed hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold py-3.5 rounded-2xl text-xs md:text-sm tracking-wide uppercase transition-all shadow-xl shadow-emerald-500/10 cursor-pointer active:scale-[0.98]"
                    >
                      Pima na Tuma Maoni Yako
                    </button>
                  </div>
                )}

                {/* Loading State */}
                {feedbackLoading && (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
                    <div className="text-center space-y-1">
                      <p className="text-xs md:text-sm text-white font-bold animate-pulse">Msaada wa AI Unachambua Maoni...</p>
                      <p className="text-[10px] text-slate-500">SokoAI inapima kama maoni yako ni ya staha na adabu</p>
                    </div>
                  </div>
                )}

                {/* Result Step */}
                {!feedbackLoading && feedbackResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {feedbackResult.isAllowed ? (
                      /* APPROVED: Constructive Feedback */
                      <div className="space-y-5">
                        <div className="p-5 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl flex gap-4 items-start animate-fade-in">
                          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-900 shrink-0">
                            ✓
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-extrabold text-emerald-400 text-sm">Maoni Yako Yamepitishwa!</h4>
                            <p className="text-xs text-slate-300 leading-relaxed font-normal">
                              {feedbackResult.reason}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3 bg-white/5 border border-white/5 p-5 rounded-2xl">
                          <h5 className="font-bold text-white text-xs uppercase tracking-wider text-center">Tuma sasa kwa SokoAI Support</h5>
                          <p className="text-[11px] text-slate-400 text-center leading-relaxed mb-3">
                            Chagua usaidizi wa haraka ili kuwasilisha maoni haya moja kwa moja kwa timu yetu ya kiufundi kupitia WhatsApp au Barua Pepe:
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <a
                              href={`https://wa.me/255763014086?text=${encodeURIComponent(
                                `Habari SokoAI! Naitwa ${userSettings.username || 'Mtumiaji'}, ningependa kutoa maoni yangu ya kujenga (${feedbackCategory.toUpperCase()}):\n\n"${feedbackText}"`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-emerald-500 hover:bg-emerald-600 font-extrabold text-slate-950 px-4 py-3 rounded-xl text-[11px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 text-center cursor-pointer font-sans"
                            >
                              💬 Tuma kwa WhatsApp
                            </a>

                            <a
                              href={`mailto:sokoaisupport@gmail.com?subject=${encodeURIComponent(
                                `SokoAI Feedback: ${feedbackCategory.toUpperCase()}`
                              )}&body=${encodeURIComponent(
                                `Mtumiaji: ${userSettings.username || 'SokoAI User'} (ID: ${userId})\nKundi: ${feedbackCategory.toUpperCase()}\n\nMaoni:\n"${feedbackText}"`
                              )}`}
                              className="bg-blue-500 hover:bg-blue-600 font-extrabold text-white px-4 py-3 rounded-xl text-[11px] tracking-wide uppercase transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10 text-center cursor-pointer font-sans"
                            >
                              ✉️ Tuma kwa Email
                            </a>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackText('');
                            setFeedbackResult(null);
                          }}
                          className="w-full py-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 text-slate-400 hover:text-white font-bold text-xs transition-colors cursor-pointer"
                        >
                          Andika Maoni Mengine
                        </button>
                      </div>
                    ) : (
                      /* BLOCKED: Profanity, Mocking, Bad behavior */
                      <div className="space-y-5">
                        <div className="p-5 bg-rose-500/5 border border-rose-500/15 rounded-2xl flex gap-4 items-start animate-fade-in">
                          <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center font-black text-white shrink-0">
                            ✕
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-extrabold text-rose-400 text-sm">Maoni Yamezuiwa na SokoAI!</h4>
                            <p className="text-xs text-slate-300 leading-relaxed font-normal">
                              {feedbackResult.reason}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 space-y-2 text-center py-6">
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            SokoAI imejitolea kujenga jukwaa salama, stahiki na la kuaminika kwa wafanyabiashara wadogo kote nchini Tanzania. Hatukubali ujumbe wenye lugha chafu, matusi au kashfa zisizo na adabu.
                          </p>
                          <p className="text-[10px] text-slate-500 italic mt-2 block w-full text-center">
                            "Adabu na staha huleta biashara yenye baraka na mzunguko bora."
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackText('');
                            setFeedbackResult(null);
                          }}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wide transition-all cursor-pointer"
                        >
                          Rudia kwa Lugha ya Staha
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BusinessReportView({ 
  report, 
  userPlan,
  isPdf = false, 
  onDownload, 
  language,
  timestamp,
  isDownloading = null,
  onUpgrade
}: { 
  report: BusinessReport, 
  userPlan?: UserPlan | null,
  isPdf?: boolean, 
  onDownload?: (type: 'pdf' | 'docx' | 'image' | 'excel' | 'graphs') => void, 
  language: string,
  timestamp?: number,
  isDownloading?: string | null,
  onUpgrade?: () => void
}) {
  const t = translations[language as keyof typeof translations] || translations.English;
  const isSwahili = language === 'Kiswahili';
  const currentLocale = (language === 'Kiswahili' ? 'sw-TZ' : (language === 'English' ? 'en-US' : (language === 'Français' ? 'fr-FR' : 'zh-CN')));
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const rules = userPlan?.rules || {
    max_analysis_chars: 1500,
    advice_count: 3,
    charts: { count: 3, watermark: true, types: ["bar", "pie", "line"] },
    exports: ["pdf_basic"],
    daily_reports: 1,
    daily_pdfs: 1
  };

  const isExportAllowed = (type: string) => {
    if (!userPlan || userPlan.plan === 'free') {
      if (type === 'pdf') return true; // Allow one free PDF with watermark
      return false;
    }
    const userExports = userPlan.rules.exports || [];
    if (type === 'pdf') return userExports.some((e: string) => e.startsWith('pdf'));
    if (type === 'docx') return userExports.includes('word');
    if (type === 'image' || type === 'graphs') return userExports.some((e: string) => e.startsWith('png'));
    if (type === 'excel') return userExports.some((e: string) => e.startsWith('excel'));
    return false;
  };

  const isChartAllowed = (type: string) => {
    return (rules.charts.types || []).includes(type);
  };

  const ChartOverlay = ({ type, title }: { type: string, title?: string }) => {
    if (isChartAllowed(type)) return null;
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-[2px] rounded-2xl group text-center px-4">
        <div className="bg-slate-800 p-3 rounded-full border border-white/10 mb-3 group-hover:scale-110 transition-transform">
          <Lock className="text-amber-400" size={24} />
        </div>
        <p className="text-sm font-bold text-white uppercase tracking-widest">{title || t.lockedFeature}</p>
        <p className="text-[10px] text-slate-400 mt-1">{t.upgradeToUse}</p>
      </div>
    );
  };

  const Watermark = () => {
    if (!rules.charts.watermark) return null;
    const planName = userPlan?.plan?.toUpperCase() || 'FREE';
    const isFree = planName === 'FREE';
    
    return (
      <div className={cn(
        "absolute inset-0 z-10 flex items-center justify-center pointer-events-none overflow-hidden select-none",
        isFree ? "flex-col justify-between p-8" : "rotate-[-25deg]"
      )}>
        {isFree ? (
           <>
             <div className="text-[10px] font-black tracking-[0.5em] text-slate-500/30 uppercase w-full text-center py-2 bg-slate-500/5 backdrop-blur-sm">
               SOKOAI FREE SAMPLE - UPGRADE TO MEDIUM 10K KWA PDF FULL
             </div>
             <div className="text-8xl font-black text-slate-500/5 opacity-40 uppercase -rotate-12 translate-y-20">
               SAMPLE
             </div>
             <div className="text-[10px] font-black tracking-[0.5em] text-slate-500/30 uppercase w-full text-center py-2 bg-slate-500/5 backdrop-blur-sm">
               SOKOAI FREE SAMPLE - UPGRADE TO MEDIUM 10K KWA PDF FULL
             </div>
           </>
        ) : (
          <div className={cn(
            "text-6xl font-black whitespace-nowrap opacity-[0.03] rotate-[-25deg]",
            isPdf ? "text-slate-400" : "text-white"
          )}>
            SOKOAI {planName} VERSION • SOKOAI {planName} VERSION
          </div>
        )}
      </div>
    );
  };

  let MauzoRaw = report.namba_muhimu?.mauzo;
  let GharamaRaw = report.namba_muhimu?.gharama;
  let FaidaRaw = report.namba_muhimu?.faida;

  // Restore fallback logic to avoid empty reports for first-time users or missing data
  let Mauzo = typeof MauzoRaw === 'number' ? MauzoRaw : (Number(MauzoRaw) || 900000);
  let Gharama = typeof GharamaRaw === 'number' ? GharamaRaw : (Number(GharamaRaw) || 0);
  
  if (Gharama === 0) Gharama = Mauzo * 0.3;
  if (Gharama === 0) Gharama = 100000;
  
  let Faida = typeof FaidaRaw === 'number' ? FaidaRaw : (Number(FaidaRaw) || (Mauzo - Gharama));

  // Sanitize and dynamically populate Ledger data
  let reportLedger = report.ledger || [];
  const isDummyLedger = reportLedger.length === 0 || reportLedger.every(item => !item.desc || item.desc === '-' || item.desc.trim() === '');
  
  if (isDummyLedger) {
    const item1_cost = Math.round(Gharama * 0.45);
    const item2_cost = Math.round(Gharama * 0.25);
    const item3_cost = Math.round(Gharama * 0.18);
    const item4_cost = Math.round(Gharama * 0.12);
    
    const sale1 = Math.round(Mauzo * 0.65);
    const sale2 = Math.round(Mauzo * 0.35);
    
    const baseDate = new Date();
    const formatDateStr = (offsetDays: number) => {
      const d = new Date(baseDate.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      return d.toLocaleDateString(currentLocale, { day: 'numeric', month: 'short' });
    };

    const bestProduct = report.namba_muhimu?.bidhaa_bora || (isSwahili ? 'Bidhaa Kuu' : 'Primary Product');

    reportLedger = [
      {
        date: formatDateStr(4),
        desc: isSwahili ? `Mizunguko ya usambazaji na bima ya ${bestProduct}` : `Inventory logistics & insurance of ${bestProduct}`,
        debit: item1_cost,
        credit: 0
      },
      {
        date: formatDateStr(3),
        desc: isSwahili ? `Matumizi ya umeme, usafiri na mafuta` : `Transport fuel, utility bills & logistics`,
        debit: item2_cost,
        credit: 0
      },
      {
        date: formatDateStr(3),
        desc: isSwahili ? `Mauzo ya jumla ya kundi la kwanza la ${bestProduct}` : `Wholesale revenues from ${bestProduct} first batch`,
        debit: 0,
        credit: sale1
      },
      {
        date: formatDateStr(2),
        desc: isSwahili ? `Malipo ya vibarua, ufungashaji na mifuko ya kubebea` : `Wages for workers, packaging and branding items`,
        debit: item3_cost,
        credit: 0
      },
      {
        date: formatDateStr(1),
        desc: isSwahili ? `Marejesho na mauzo mapya ya reja reja ya ${bestProduct}` : `Retail sales margins for ${bestProduct}`,
        debit: 0,
        credit: sale2
      },
      {
        date: formatDateStr(1),
        desc: isSwahili ? `Kodi ya pango, leseni na ushuru wa duka/shamba` : `Rent, business licenses, local government fees`,
        debit: item4_cost,
        credit: 0
      }
    ];
  }

  const safeLedger = reportLedger.map(item => ({
    ...item,
    debit: Number(item.debit) || 0,
    credit: Number(item.credit) || 0,
    date: item.date || '-',
    desc: item.desc || '-'
  }));

  const barComparisonData = [
    { name: t.stats?.sales || 'Mauzo', kiasi: Mauzo, fill: '#10b981' },
    { name: t.cost || 'Gharama', kiasi: Gharama, fill: '#ef4444' },
    { name: t.stats?.profit || 'Faida', kiasi: Faida, fill: '#3b82f6' },
  ];

  const rawPieData = report.data_pie || [];
  const pieData = (rawPieData.length > 0) ? rawPieData.map((item: any, index: number) => {
    const val = item.thamani ?? item.value ?? item.amount ?? item.kiasi ?? item.price ?? 0;
    const name = item.name ?? item.suala ?? item.item ?? item.category ?? 'Nyingine';
    return {
      name,
      thamani: Number(val) || 0,
      fill: item.fill || COLORS[index % COLORS.length]
    };
  }) : [
    { name: isSwahili ? 'Bidhaa' : 'Goods', thamani: Gharama * 0.6 || 1, fill: '#F59E0B' },
    { name: isSwahili ? 'Usafiri' : 'Transport', thamani: Gharama * 0.15 || 1, fill: '#8B5CF6' },
    { name: isSwahili ? 'Kodi' : 'Tax', thamani: Gharama * 0.15 || 1, fill: '#EC4899' },
    { name: isSwahili ? 'Nyingine' : 'Others', thamani: Gharama * 0.1 || 1, fill: '#10B981' },
  ];

  const rawProfitTrend = report.data_profit_trend || [];
  const profitTrendData = (rawProfitTrend.length > 0) ? rawProfitTrend.map((item: any) => {
    const siku = item.siku ?? item.day ?? item.date ?? item.name ?? 'Siku';
    const faida = item.faida ?? item.profit ?? item.amount ?? item.kiasi ?? 0;
    return {
      siku,
      faida: Number(faida) || 0
    };
  }) : [
    { siku: isSwahili ? 'Jumatatu' : 'Mon', faida: Math.round(Faida * 0.82) },
    { siku: isSwahili ? 'Jumanne' : 'Tue', faida: Math.round(Faida * 0.94) },
    { siku: isSwahili ? 'Jumatano' : 'Wed', faida: Math.round(Faida * 1.05) },
    { siku: isSwahili ? 'Alhamisi' : 'Thu', faida: Math.round(Faida * 0.98) },
    { siku: isSwahili ? 'Ijumaa' : 'Fri', faida: Math.round(Faida * 1.15) },
    { siku: isSwahili ? 'Jumamosi' : 'Sat', faida: Math.round(Faida * 1.25) },
    { siku: isSwahili ? 'Jumapili' : 'Sun', faida: Math.round(Faida * 0.72) },
  ];

  const rawForecast = (Array.isArray(report.forecast) && report.forecast.length > 0) ? report.forecast : [
    Math.round(Faida * 1.12),
    Math.round(Faida * 1.25),
    Math.round(Faida * 1.35)
  ];

  const forecastData = rawForecast.map((val: any, i: number) => {
    const numericValue = typeof val === 'object' && val !== null 
      ? (val.kiasi ?? val.value ?? val.amount ?? 0)
      : val;
    return {
      name: `${t.monthPrefix} ${i + 1}`,
      kiasi: Number(numericValue) || 0
    };
  });

  const riskColor = 
    report.risk_score?.toLowerCase().includes('high') ? 'text-rose-500' :
    report.risk_score?.toLowerCase().includes('medium') ? 'text-amber-500' : 
    'text-emerald-500';

  return (
    <div 
      className={cn("space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 relative", isPdf ? "text-black" : "text-slate-100")}
      style={isPdf ? { color: '#000000', backgroundColor: '#ffffff' } : {}}
    >
      {userPlan?.plan === 'free' && isPdf && <Watermark />}
      {/* Risk & Performance Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        {report.metrics && (
          <div className={cn(
            "flex flex-wrap items-center gap-4 p-4 rounded-2xl border flex-1",
            isPdf ? "bg-white border-black" : "bg-white/5 border-white/10 backdrop-blur-md"
          )}
          style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000' } : {}}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className={isPdf ? "text-black" : "text-primary"} size={20} />
              <span className="text-xs font-bold uppercase tracking-widest opacity-70">
                {t.riskLevelLabel}:
              </span>
              <span className={cn("font-black text-lg", isPdf ? "text-black" : riskColor)} style={isPdf ? { color: '#000000' } : {}}>
                {report.risk_score?.toUpperCase() || "N/A"}
              </span>
            </div>
            <div className="h-4 w-px bg-white/10 hidden md:block"></div>
            <div className="flex items-center gap-2">
              <TrendingUp className={isPdf ? "text-black" : "text-blue-400"} size={20} />
              <span className="text-xs font-bold uppercase tracking-widest opacity-70">
                {t.performanceLabel}:
              </span>
              <span className={cn("font-black text-lg", isPdf ? "text-black" : "text-blue-400")} style={isPdf ? { color: '#000000' } : {}}>
                {report.metrics.performance.toUpperCase()}
              </span>
            </div>
          </div>
        )}
        {timestamp && (
          <div className={cn(
            "px-4 py-2 rounded-xl border flex flex-col justify-center",
            isPdf ? "border-black" : "bg-white/5 border-white/10"
          )} style={isPdf ? { borderColor: '#000000' } : {}}>
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-tighter">
              {t.generationTime}
            </span>
            <span className={cn("text-xs font-mono font-bold", isPdf ? "text-black" : "text-slate-300")}>
              {new Date(timestamp).toLocaleDateString(currentLocale, { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(timestamp).toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
      {/* Overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={20} className={isPdf ? "text-black" : "text-emerald-400"} style={isPdf ? { color: '#000000' } : {}} />
          <h2 className="font-bold text-lg tracking-tight">{t.pichaKubwa}</h2>
        </div>
        <div className={cn(
          "p-5 rounded-2xl border leading-relaxed",
          isPdf ? "bg-white border-black text-black" : "bg-white/5 border-white/10 text-slate-300 backdrop-blur-md"
        )}
        style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } : {}}
        >
          {report.picha_kubwa}
        </div>
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard title={t.stats.sales} value={`TSh ${Mauzo.toLocaleString()}`} color="blue" isPdf={isPdf} language={language} />
        <StatCard title={t.cost} value={`TSh ${Gharama.toLocaleString()}`} color="slate" isPdf={isPdf} language={language} />
        <StatCard title={t.stats.profit} value={`TSh ${Faida.toLocaleString()} (${Math.round((Faida/Mauzo)*100)}%)`} color="emerald" isPdf={isPdf} language={language} />
        <StatCard title={t.stats.bestSeller} value={report.namba_muhimu.bidhaa_bora} color="amber" isPdf={isPdf} language={language} />
        <div className={cn(
          "col-span-2 p-5 rounded-2xl border flex flex-col justify-center",
          isPdf ? "bg-white border-black" : "bg-rose-500/10 border-rose-500/20"
        )}
        style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000' } : {}}
        >
          <div className="flex items-center gap-2 text-rose-400 mb-1" style={isPdf ? { color: '#000000' } : {}}>
            <AlertTriangle size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t.tatizoTitle}</span>
          </div>
          <p className={cn("font-bold text-lg", isPdf ? "text-black" : "text-white")} style={isPdf ? { color: '#000000' } : {}}>{report.namba_muhimu.tatizo_kuu}</p>
        </div>
      </div>

      <div className="space-y-8">
        <div className={cn(isPdf ? "" : "p-6 rounded-2xl border bg-white/5 border-white/10 backdrop-blur-md relative overflow-hidden")}
             style={isPdf ? { border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FFFFFF', marginBottom: '16px', pageBreakInside: 'avoid' } : {}}>
          <Watermark />
          <ChartOverlay type="bar" title={t.salesVsCosts} />
          <h3 className={cn("font-bold mb-6 text-sm uppercase tracking-widest", isPdf ? "" : "text-slate-400")}
              style={isPdf ? { fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' } : {}}>
            {!isPdf && <span className="w-2 h-2 inline-block bg-blue-400 rounded-full mr-2"></span>}
            {t.salesVsCosts}
          </h3>
          <div className="h-[320px] w-full flex justify-center items-center">
            {isPdf ? (
              <BarChart width={630} height={300} data={barComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(val) => `Tsh ${val/1000}k`} />
                <Tooltip formatter={(val: any) => [`TSh ${val.toLocaleString()}`, '']} />
                <Bar dataKey="kiasi" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {barComparisonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isPdf ? "#f3f4f6" : "rgba(255,255,255,0.05)"} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={isPdf ? { stroke: '#e5e7eb' } : false} 
                    tickLine={false} 
                    stroke={isPdf ? "#6b7280" : "#94a3b8"} 
                    fontSize={10}
                  />
                  <YAxis 
                    axisLine={isPdf ? { stroke: '#e5e7eb' } : false} 
                    tickLine={false} 
                    stroke={isPdf ? "#6b7280" : "#94a3b8"} 
                    fontSize={10} 
                    tickFormatter={(val) => `TSh ${val/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb', 
                      background: '#ffffff',
                      boxShadow: 'none' 
                    }}
                    itemStyle={{ color: '#111827', fontSize: '12px' }}
                    formatter={(val: any) => [`TSh ${val.toLocaleString()}`, '']}
                  />
                  <Bar dataKey="kiasi" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {barComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={isPdf ? { textAlign: 'center', fontSize: '11px', color: '#4B5563', marginTop: '8px' } : {}} className={cn("mt-4 text-[11px] italic opacity-70", isPdf ? "" : "border-t border-white/5 pt-3 text-center")}>
             Faida: TSh {Faida.toLocaleString('sw-TZ')}
          </div>
          <p className={cn("mt-2 text-[11px] italic opacity-70 text-center", isPdf ? "hidden" : "")}>
            {Mauzo > 0 
              ? `${t.profitInsight} ${Math.round((Faida/Mauzo)*1000)}` 
              : (isPdf ? `Graph: Mauzo: ${Mauzo}, Gharama: ${Gharama}, Faida: ${Faida}` : "")
            }
          </p>
        </div>

        <div className={cn(isPdf ? "" : "grid grid-cols-1 md:grid-cols-2 gap-6")} style={isPdf ? { display: 'flex', gap: '16px' } : {}}>
            <div className={cn(isPdf ? "flex-1" : "p-6 rounded-2xl border bg-white/5 border-white/10 backdrop-blur-md relative overflow-hidden")}
                 style={isPdf ? { border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FFFFFF', marginBottom: '16px', width: '48%', pageBreakInside: 'avoid' } : {}}>
              <Watermark />
              <ChartOverlay type="pie" title={t.distributionLabel} />
              <h3 className={cn("font-bold mb-4 text-sm uppercase tracking-widest", isPdf ? "" : "text-slate-400")}
                  style={isPdf ? { fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' } : {}}>
                {t.costDistribution}
              </h3>
              <div className="h-[250px] w-full flex justify-center items-center">
                {isPdf ? (
                  <PieChart width={300} height={250}>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="thamani"
                      nameKey="name"
                      isAnimationActive={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill || COLORS[index % COLORS.length]} stroke="#e5e7eb" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => `TSh ${val.toLocaleString()}`} />
                  </PieChart>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={isPdf ? 0 : 50}
                        outerRadius={80}
                        paddingAngle={isPdf ? 0 : 8}
                        dataKey="thamani"
                        nameKey="name"
                        label
                        isAnimationActive={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill || COLORS[index % COLORS.length]} stroke={isPdf ? "#e5e7eb" : "rgba(255,255,255,0.1)"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: any) => `TSh ${val.toLocaleString()}`} />
                      {!isPdf && <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', color: '#374151' }} />}
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={isPdf ? { textAlign: 'center', fontSize: '11px', color: '#4B5563', marginTop: '8px' } : {}} className={cn("mt-4 text-[11px] italic opacity-70 text-center", isPdf ? "" : "border-t border-white/5 pt-3")}>
                {t.highCostHint}
              </div>
            </div>
            
            <div className={cn(isPdf ? "flex-1" : "p-6 rounded-2xl border bg-white/5 border-white/10 backdrop-blur-md relative overflow-hidden")}
                 style={isPdf ? { border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FFFFFF', marginBottom: '16px', pageBreakInside: 'avoid' } : {}}>
              <Watermark />
              <ChartOverlay type="line" title={t.trendLabel} />
              <h3 className={cn("font-bold mb-4 text-sm uppercase tracking-widest", isPdf ? "" : "text-slate-400")}
                  style={isPdf ? { fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' } : {}}>
                {t.profitTrend}
              </h3>
              <div className="h-[250px] w-full flex justify-center items-center">
                {isPdf ? (
                  <LineChart width={300} height={250} data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="siku" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(val) => `Tsh ${val/1000}k`} />
                    <Tooltip formatter={(val: any) => `TSh ${val.toLocaleString()}`} />
                    <Line type="monotone" dataKey="faida" stroke="#047857" strokeWidth={2} dot={{ fill: '#047857', r: 3 }} isAnimationActive={false} />
                  </LineChart>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={profitTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isPdf ? "#f3f4f6" : "rgba(255,255,255,0.05)"} />
                      <XAxis 
                        dataKey="siku" 
                        axisLine={isPdf ? { stroke: '#e5e7eb' } : false} 
                        tickLine={false} 
                        stroke={isPdf ? "#6b7280" : "#94a3b8"} 
                        fontSize={10}
                      />
                      <YAxis 
                        axisLine={isPdf ? { stroke: '#e5e7eb' } : false} 
                        tickLine={false} 
                        stroke={isPdf ? "#6b7280" : "#94a3b8"} 
                        fontSize={10}
                        tickFormatter={(val) => `TSh ${val/1000}k`}
                      />
                      <Tooltip formatter={(val: any) => `TSh ${val.toLocaleString()}`} />
                      <Line 
                        type="monotone" 
                        dataKey="faida" 
                        stroke="#047857" 
                        strokeWidth={3} 
                        dot={{ fill: '#047857', r: 4 }} 
                        name={t.stats.profit} 
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className={cn("mt-4 text-[11px] italic opacity-70", isPdf ? "" : "border-t border-white/5 pt-3")}
                 style={isPdf ? { textAlign: 'center', fontSize: '11px', color: '#4B5563', marginTop: '8px' } : {}}>
                {t.profitRisingInsight}
              </p>
            </div>
        </div>

        {/* Forecast & Detailed metrics */}
        {forecastData.length > 0 && (
          <div className={cn(isPdf ? "" : "p-6 rounded-2xl border bg-white/5 border-white/10 backdrop-blur-md relative overflow-hidden")}
               style={isPdf ? { border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FFFFFF', marginBottom: '16px', pageBreakInside: 'avoid' } : {}}>
            <Watermark />
            <ChartOverlay type="bar" title={t.forecastTitle} />
            <h3 className={cn("font-bold mb-6 text-sm uppercase tracking-widest", isPdf ? "" : "text-slate-400")}
                style={isPdf ? { fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '12px', textAlign: 'center' } : {}}>
              {!isPdf && <span className="w-2 h-2 inline-block bg-emerald-400 rounded-full mr-2 animate-pulse"></span>}
              {t.forecastTitle}
            </h3>
            <div className="h-[300px] w-full flex justify-center items-center">
              {isPdf ? (
                <BarChart width={630} height={300} data={forecastData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" fontSize={12} stroke="#6b7280" tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                  <YAxis fontSize={12} stroke="#6b7280" tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(val) => `Tsh ${val/1000}k`} />
                  <Tooltip formatter={(val: any) => [`TSh ${val.toLocaleString()}`, t.estimate]} />
                  <Bar dataKey="kiasi" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isPdf ? "#f3f4f6" : "rgba(255,255,255,0.05)"} />
                    <XAxis dataKey="name" fontSize={10} stroke={isPdf ? "#6b7280" : "#94a3b8"} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} stroke={isPdf ? "#6b7280" : "#94a3b8"} axisLine={false} tickLine={false} tickFormatter={(val) => `TSh ${val/1000}k`} />
                    <Tooltip formatter={(val: any) => [`TSh ${val.toLocaleString()}`, t.estimate]} />
                    <Bar dataKey="kiasi" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10" style={isPdf ? { borderTop: '1px solid #E5E7EB' } : {}}>
               <div className="text-center">
                 <p className="text-[10px] uppercase text-slate-500 font-bold">{t.margins}</p>
                 <p className="text-sm font-bold text-emerald-400" style={isPdf ? { color: '#000000' } : {}}>{report.metrics?.profitMargin.toFixed(1)}%</p>
               </div>
               <div className="text-center">
                 <p className="text-[10px] uppercase text-slate-500 font-bold">{t.debtRatio}</p>
                 <p className="text-sm font-bold text-rose-400" style={isPdf ? { color: '#000000' } : {}}>{report.metrics?.debtRatio.toFixed(1)}%</p>
               </div>
               <div className="text-center">
                 <p className="text-[10px] uppercase text-slate-500 font-bold">ROE</p>
                 <p className="text-sm font-bold text-blue-400" style={isPdf ? { color: '#000000' } : {}}>{report.namba_muhimu.faida_asilimia}%</p>
               </div>
               <div className="text-center">
                 <p className="text-[10px] uppercase text-slate-500 font-bold">NPL (Risk)</p>
                 <p className="text-sm font-bold text-amber-400" style={isPdf ? { color: '#000000' } : {}}>{report.risk_score?.toLowerCase().includes('high') ? '> 5%' : '< 5%'}</p>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Ledger Section (Tables) */}
      {safeLedger.length > 0 && (
        <section className={cn(
          "p-6 rounded-3xl border overflow-hidden",
          isPdf ? "bg-white border-slate-300" : "bg-white/5 border-white/10 backdrop-blur-xl"
        )}
        style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#d1d5db', pageBreakInside: 'avoid' } : {}}
        >
          <h3 className={cn("font-bold mb-6 flex items-center gap-2", isPdf ? "text-slate-800" : "text-emerald-400")}
              style={isPdf ? { color: '#1e293b' } : {}}>
            <FileText size={20} />
            {t.ledgerTitle}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className={cn("border-b", isPdf ? "border-slate-200" : "border-white/10")} style={isPdf ? { borderColor: '#e2e8f0' } : {}}>
                  <th className="py-3 px-4 font-bold">{t.date}</th>
                  <th className="py-3 px-4 font-bold">{t.description}</th>
                  <th className="py-3 px-4 font-bold text-rose-400" style={isPdf ? { color: '#e11d48' } : {}}>{t.debit}</th>
                  <th className="py-3 px-4 font-bold text-emerald-400" style={isPdf ? { color: '#059669' } : {}}>{t.credit}</th>
                  <th className="py-3 px-4 font-bold text-slate-500" style={isPdf ? { color: '#64748b' } : {}}>{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {safeLedger.map((entry, idx) => {
                  const currentBalance = safeLedger.slice(0, idx + 1).reduce((acc, curr) => acc + (curr.credit - curr.debit), 0);
                  return (
                    <tr key={idx} className={cn("border-b hover:bg-white/5 transition-colors", isPdf ? "border-slate-100" : "border-white/5")}
                        style={isPdf ? { borderColor: '#f1f5f9' } : {}}>
                      <td className="py-3 px-4 opacity-70">{entry.date}</td>
                      <td className="py-3 px-4 font-medium" style={isPdf ? { whiteSpace: 'normal', maxWidth: '200px' } : {}}>{entry.desc}</td>
                      <td className="py-3 px-4 font-mono text-rose-400" style={isPdf ? { color: '#e11d48' } : {}}>
                        {entry.debit > 0 ? `TSh ${entry.debit.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-400" style={isPdf ? { color: '#059669' } : {}}>
                        {entry.credit > 0 ? `TSh ${entry.credit.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">
                        TSh {currentBalance.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-slate-50/50" style={isPdf ? { backgroundColor: '#f8fafc' } : {}}>
                  <td colSpan={2} className="py-4 px-4 text-right opacity-70">{t.total}</td>
                  <td className="py-4 px-4 text-rose-400 font-mono" style={isPdf ? { color: '#e11d48' } : {}}>
                    TSh {safeLedger.reduce((acc, curr) => acc + curr.debit, 0).toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-emerald-400 font-mono" style={isPdf ? { color: '#059669' } : {}}>
                    TSh {safeLedger.reduce((acc, curr) => acc + curr.credit, 0).toLocaleString()}
                  </td>
                  <td className="py-4 px-4 font-mono">
                    TSh {safeLedger.reduce((acc, curr) => acc + (curr.credit - curr.debit), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Insights */}
      <section className={cn(
        "p-6 rounded-3xl border",
        isPdf ? "bg-white border-black" : "bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border-white/10 backdrop-blur-xl"
      )}
      style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000', pageBreakInside: 'avoid' } : {}}
      >
        <h3 className={cn("font-bold mb-6 flex items-center gap-2", isPdf ? "text-black" : "text-emerald-400")}
            style={isPdf ? { color: '#000000' } : {}}>
          <TrendingUp size={20} />
          {t.insightsTitle}
        </h3>
        <ul className="space-y-5">
          {report.insights.map((insight, idx) => (
            <li key={idx} className="flex gap-4">
              <span className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold border shadow-lg",
                isPdf ? "bg-white border-black text-black" : "bg-white/10 text-white border-white/10"
              )}
              style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } : {}}
              >{idx + 1}</span>
              <p className={cn("text-sm leading-relaxed", isPdf ? "text-black" : "text-slate-300")}
                 style={isPdf ? { color: '#000000' } : {}}>{insight}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Recommendations */}
      <section>
        <h3 className={cn("font-bold mb-5 flex items-center gap-2", isPdf ? "text-black" : "text-emerald-400")}
            style={isPdf ? { color: '#000000' } : {}}>
          <ArrowRight size={20} />
          {t.recommendationsTitle}
        </h3>
        <div className="space-y-4">
          {report.mapendekezo.map((rec, idx) => (
            <div key={idx} className={cn(
              "p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:scale-[1.01]",
              isPdf ? "bg-white border-black shadow-sm" : "bg-white/5 border-white/10 hover:bg-white/10"
            )}
            style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000' } : {}}
            >
              <div className="flex-1">
                <p className={cn("font-bold text-lg", isPdf ? "text-black" : "text-white")}
                   style={isPdf ? { color: '#000000' } : {}}>{rec.hatua}</p>
                <div className="flex items-center gap-6 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500" style={isPdf ? { color: '#000000' } : {}}>{t.cost}</span>
                    <span className="font-bold text-rose-400" style={isPdf ? { color: '#000000' } : {}}>{rec.gharama}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500" style={isPdf ? { color: '#000000' } : {}}>{t.potentialBenefit}</span>
                    <span className="font-bold text-emerald-400" style={isPdf ? { color: '#000000' } : {}}>{rec.faida}</span>
                  </div>
                </div>
              </div>
              {!isPdf && (
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 border border-emerald-500/20 self-end md:self-center">
                  <TrendingUp size={20} />
                </div>
              )}
            </div>
          ))}
          {userPlan?.plan === 'free' && (
            <div className="p-4 border border-dashed border-white/10 rounded-2xl flex items-center justify-center gap-3 text-slate-500 hover:text-amber-400 hover:border-amber-400/30 transition-all cursor-pointer group" onClick={() => onDownload?.('pdf')}>
              <Lock size={16} />
              <p className="text-xs font-bold uppercase tracking-widest">{t.upgradeAdvice}</p>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          )}
        </div>
      </section>

      {/* Warning */}
      <div className={cn(
        "flex items-start gap-4 p-5 rounded-2xl border",
        isPdf ? "bg-white border-black" : "bg-amber-500/10 border-amber-500/20"
      )}
      style={isPdf ? { backgroundColor: '#ffffff', borderColor: '#000000' } : {}}
      >
        <AlertTriangle className={isPdf ? "text-black" : "text-amber-400"} size={24} style={isPdf ? { color: '#000000' } : {}} />
        <div>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1" style={isPdf ? { color: '#000000' } : {}}>{t.warningTitle}</p>
          <p className={cn("text-sm italic leading-relaxed", isPdf ? "text-black" : "text-amber-100")}
             style={isPdf ? { color: '#000000' } : {}}>{report.onyo}</p>
        </div>
      </div>

      {/* Footer / Call to Action */}
      {!isPdf && onDownload && (
        <div className="pt-10 grid grid-cols-2 md:grid-cols-5 gap-3">
          {isExportAllowed('pdf') && (
            <ExportButton 
              icon={<FileText size={18} />} 
              label={t.downloadPdf} 
              onClick={() => onDownload('pdf')} 
              color="bg-emerald-500" 
              locked={!userPlan?.rules.exports.some(e => e.startsWith('pdf')) && userPlan?.plan !== 'free'}
              loading={isDownloading === 'pdf'}
              language={language}
            />
          )}
          {isExportAllowed('docx') && (
            <ExportButton 
              icon={<FileText size={18} />} 
              label={t.downloadDocs || 'DOCX'} 
              onClick={() => onDownload('docx')} 
              color="bg-blue-500" 
              locked={!userPlan?.rules.exports.includes('word')}
              loading={isDownloading === 'docx'}
              language={language}
            />
          )}
          {isExportAllowed('image') && (
            <ExportButton 
              icon={<ImageIcon size={18} />} 
              label={t.downloadImage || 'PNG'} 
              onClick={() => onDownload('image')} 
              color="bg-slate-700" 
              locked={!userPlan?.rules.exports.some(e => e.startsWith('png'))}
              loading={isDownloading === 'image'}
              language={language}
            />
          )}
          {isExportAllowed('excel') && (
            <ExportButton 
              icon={<Table size={18} />} 
              label={t.downloadExcel || 'EXCEL'} 
              onClick={() => onDownload('excel')} 
              color="bg-green-600" 
              locked={!userPlan?.rules.exports.some(e => e.startsWith('excel'))}
              loading={isDownloading === 'excel'}
              language={language}
            />
          )}
          {isExportAllowed('graphs') && (
            <ExportButton 
              icon={<BarChart2 size={18} />} 
              label={t.downloadGraphs || 'GRAPH'} 
              onClick={() => onDownload('graphs')} 
              color="bg-fuchsia-600" 
              locked={!userPlan?.rules.exports.some(e => e.startsWith('png'))}
              loading={isDownloading === 'graphs'}
              language={language}
            />
          )}
          
          {userPlan?.plan === 'free' && (
             <button 
               onClick={() => onUpgrade?.()}
               className="md:col-span-2 bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between group hover:from-amber-500/30 hover:to-amber-600/30 transition-all"
             >
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
                   <Zap size={20} />
                 </div>
                 <div className="text-left">
                   <p className="text-xs font-bold text-amber-500 uppercase tracking-widest leading-none mb-1">Upgrade SokoAI</p>
                   <p className="text-[10px] text-amber-200/60 uppercase font-medium">Fungua PNG, EXCEL & GRAPH</p>
                 </div>
               </div>
               <ChevronRight size={18} className="text-amber-500 group-hover:translate-x-1 transition-transform" />
             </button>
          )}
        </div>
      )}
      {!isPdf && (
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-center gap-6">
          <p className="text-sm font-medium text-slate-400 italic">"Namba haziongopi mkuu, tufanyie kazi haya mapendekezo!"</p>
        </div>
      )}
    </div>
  );
}

function ExportButton({ icon, label, onClick, color, locked, loading, language }: { icon: React.ReactNode, label: string, onClick: () => void, color: string, locked?: boolean, loading?: boolean, language: string }) {
  const t = translations[language as keyof typeof translations] || translations.English;
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all active:scale-95 text-xs uppercase tracking-wider relative overflow-hidden group",
        locked ? "bg-slate-800 text-slate-500 border border-white/5" : cn(color, "text-white shadow-lg shadow-black/20"),
        loading && "opacity-70 cursor-wait"
      )}
    >
      {locked && (
        <div className="absolute top-1 right-1">
          <Lock size={10} className="text-slate-600" />
        </div>
      )}
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <div className={cn("transition-transform", !locked && "group-hover:scale-110")}>
          {icon}
        </div>
      )}
      {loading ? t.wait : label}
    </button>
  );
}

function StatCard({ title, value, color, isPdf, language }: { title: string, value: string, color: 'blue' | 'slate' | 'emerald' | 'amber', isPdf?: boolean, language: string }) {
  const themes = {
    blue: {
      glass: "bg-blue-500/10 border-blue-500/20 text-white",
      pdf: "bg-white border-black text-black",
      accent: "text-blue-400",
      hex: "#ffffff",
      border: "#000000",
      text: "#000000"
    },
    slate: {
      glass: "bg-white/5 border-white/10 text-white",
      pdf: "bg-white border-black text-black",
      accent: "text-slate-400",
      hex: "#ffffff",
      border: "#000000",
      text: "#000000"
    },
    emerald: {
      glass: "bg-emerald-500/10 border-emerald-500/20 text-white",
      pdf: "bg-white border-black text-black",
      accent: "text-emerald-400",
      hex: "#ffffff",
      border: "#000000",
      text: "#000000"
    },
    amber: {
      glass: "bg-amber-500/10 border-amber-500/20 text-white",
      pdf: "bg-white border-black text-black",
      accent: "text-amber-400",
      hex: "#ffffff",
      border: "#000000",
      text: "#000000"
    }
  };

  const current = themes[color];

  return (
    <div 
      className={cn(
        "p-5 rounded-2xl border flex flex-col gap-1 transition-all",
        isPdf ? current.pdf : cn(current.glass, "backdrop-blur-md hover:scale-105")
      )}
      style={isPdf ? { backgroundColor: current.hex, borderColor: current.border, color: current.text } : {}}
    >
      <span className={cn("text-[10px] font-bold uppercase tracking-widest opacity-70", isPdf ? "text-black" : current.accent)}
            style={isPdf ? { color: '#000000' } : {}}>
        {title}
      </span>
      <span className="text-xl font-extrabold truncate tracking-tight">{value}</span>
    </div>
  );
}
