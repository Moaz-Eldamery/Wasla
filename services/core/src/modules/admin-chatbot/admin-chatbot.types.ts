export type ChatbotLanguage = 'ar' | 'en';
export type ChatbotAnswerStatus = 'ANSWERED' | 'NO_INFORMATION';

export interface LocalizedText {
  ar: string;
  en: string;
}

export interface ChatbotSource {
  entryId: string;
  title: LocalizedText;
}

export interface ChatbotAnswer {
  status: ChatbotAnswerStatus;
  answer: string;
  language: ChatbotLanguage;
  sources: ChatbotSource[];
}
