export interface PlanRules {
  price?: number;
  duration?: string;
  max_analysis_chars: number;
  advice_count: number;
  charts: { count: number; watermark: boolean; types: string[] };
  exports: string[];
  daily_reports: number;
  features_list?: string[];
}

export interface UserPlan {
  plan: 'free' | 'medium' | 'pro';
  rules: PlanRules;
  expired: boolean;
  expires_at?: string;
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const response = await fetch('/api/get_user_plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  return response.json();
}

export async function activateCode(userId: string, code: string, planRequested?: string) {
  const response = await fetch('/api/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, code, plan: planRequested }),
  });
  return response.json();
}

export async function logUsage(userId: string, feature: string) {
  await fetch('/api/log_usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, feature }),
  });
}

export async function getTareheLeo(lang: string = 'English') {
  const response = await fetch(`/api/get_tarehe_leo?lang=${lang}`);
  return response.json();
}

export async function getSikuZilizobaki(userId: string) {
  const response = await fetch('/api/siku_zilizobaki', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  return response.json();
}

export async function canUseFeature(userId: string, featureType: string, featureName: string) {
  const response = await fetch('/api/can_use_feature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, feature_type: featureType, feature_name: featureName }),
  });
  return response.json();
}

export async function getPlans() {
  const response = await fetch('/api/get_plans');
  return response.json();
}

export async function checkPlanAccess(userId: string, plan: string) {
  const response = await fetch('/api/check_plan_access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, plan }),
  });
  return response.json();
}
