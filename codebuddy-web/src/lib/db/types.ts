/*
 * The parts of the Supabase database CodeBuddy uses, in the shape
 * `@supabase/supabase-js` expects. Written by hand to match
 * `supabase/migrations/`; update both together.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AiMode = "learn" | "debug";

export type Database = {
  public: {
    Tables: {
      ai_requests: {
        Row: {
          id: string;
          user_id: string;
          mode: AiMode;
          created_at: string;
          request: Json | null;
          response: Json | null;
          model: string | null;
          answered_at: string | null;
        };
        // Students can't write this table directly; the functions below do.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      practice_progress: {
        Row: {
          user_id: string;
          exercise_id: string;
          draft: string;
          hints_used: number;
          last_verdict: "correct" | "partial" | "incorrect" | "unverified" | null;
          solved_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          draft?: string;
          hints_used?: number;
          last_verdict?: "correct" | "partial" | "incorrect" | "unverified" | null;
        };
        Update: {
          draft?: string;
          hints_used?: number;
          last_verdict?: "correct" | "partial" | "incorrect" | "unverified" | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_ai_request: {
        Args: { p_mode: AiMode };
        Returns: { request_id: string | null; remaining: number; retry_at: string | null }[];
      };
      record_ai_answer: {
        Args: { p_request_id: string; p_request: Json; p_response: Json; p_model: string };
        Returns: boolean;
      };
      clear_ai_history: {
        Args: { p_request_id?: string };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
