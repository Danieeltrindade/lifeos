/**
 * Tipos do banco (schema public) no formato do `supabase gen types typescript`.
 *
 * GERADO a partir do catálogo do PostgreSQL com as migrations de supabase/migrations aplicadas.
 * Não edite à mão: depois de mudar o schema, regenere com `npm run db:types`
 * (Supabase CLI, projeto vinculado) e confira o diff.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category_id: string | null;
          source: string;
          session_id: string | null;
          started_at: string;
          ended_at: string;
          duration_seconds: number;
          subject_id: string | null;
          topic_id: string | null;
          task_id: string | null;
          project_id: string | null;
          notes: string;
          created_at: string;
          updated_at: string;
          kind: string;
          pages: number | null;
          reading_title: string | null;
          distance_km: number | null;
          intensity: number | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          category_id?: string | null;
          source?: string;
          session_id?: string | null;
          started_at: string;
          ended_at: string;
          duration_seconds?: number;
          subject_id?: string | null;
          topic_id?: string | null;
          task_id?: string | null;
          project_id?: string | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
          kind?: string;
          pages?: number | null;
          reading_title?: string | null;
          distance_km?: number | null;
          intensity?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          category_id?: string | null;
          source?: string;
          session_id?: string | null;
          started_at?: string;
          ended_at?: string;
          duration_seconds?: number;
          subject_id?: string | null;
          topic_id?: string | null;
          task_id?: string | null;
          project_id?: string | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
          kind?: string;
          pages?: number | null;
          reading_title?: string | null;
          distance_km?: number | null;
          intensity?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_category_fk';
            columns: ['category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'activity_categories';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_project_fk';
            columns: ['project_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_session_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'focus_sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_topic_fk';
            columns: ['topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'activities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          color?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_categories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      availability_windows: {
        Row: {
          id: string;
          user_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'availability_windows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_event_exceptions: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          original_starts_at: string | null;
          original_date: string | null;
          kind: string;
          new_title: string | null;
          new_starts_at: string | null;
          new_ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          event_id: string;
          original_starts_at?: string | null;
          original_date?: string | null;
          kind: string;
          new_title?: string | null;
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_id?: string;
          original_starts_at?: string | null;
          original_date?: string | null;
          kind?: string;
          new_title?: string | null;
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_event_exceptions_event_fk';
            columns: ['event_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_events';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'calendar_event_exceptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          kind: string;
          all_day: boolean;
          starts_at: string | null;
          ends_at: string | null;
          start_date: string | null;
          end_date: string | null;
          timezone: string;
          recurrence_rule: string | null;
          task_id: string | null;
          subject_id: string | null;
          habit_id: string | null;
          created_at: string;
          updated_at: string;
          category_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          description?: string;
          kind?: string;
          all_day?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          timezone?: string;
          recurrence_rule?: string | null;
          task_id?: string | null;
          subject_id?: string | null;
          habit_id?: string | null;
          created_at?: string;
          updated_at?: string;
          category_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          kind?: string;
          all_day?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          timezone?: string;
          recurrence_rule?: string | null;
          task_id?: string | null;
          subject_id?: string | null;
          habit_id?: string | null;
          created_at?: string;
          updated_at?: string;
          category_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_events_category_fk';
            columns: ['category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'activity_categories';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'calendar_events_habit_fk';
            columns: ['habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'calendar_events_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'calendar_events_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'calendar_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      diary_entries: {
        Row: {
          id: string;
          user_id: string;
          local_date: string;
          content: string;
          mood: number | null;
          energy: number | null;
          created_at: string;
          updated_at: string;
          title: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          local_date: string;
          content?: string;
          mood?: number | null;
          energy?: number | null;
          created_at?: string;
          updated_at?: string;
          title?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          local_date?: string;
          content?: string;
          mood?: number | null;
          energy?: number | null;
          created_at?: string;
          updated_at?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'diary_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      focus_sessions: {
        Row: {
          id: string;
          user_id: string;
          subject_id: string | null;
          topic_id: string | null;
          task_id: string | null;
          status: string;
          started_at: string;
          ended_at: string | null;
          planned_seconds: number | null;
          note: string;
          created_at: string;
          updated_at: string;
          technique: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          subject_id?: string | null;
          topic_id?: string | null;
          task_id?: string | null;
          status?: string;
          started_at?: string;
          ended_at?: string | null;
          planned_seconds?: number | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
          technique?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          subject_id?: string | null;
          topic_id?: string | null;
          task_id?: string | null;
          status?: string;
          started_at?: string;
          ended_at?: string | null;
          planned_seconds?: number | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
          technique?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'focus_sessions_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'focus_sessions_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'focus_sessions_topic_fk';
            columns: ['topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'focus_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_changes: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          changed_at: string;
          old_target: number | null;
          new_target: number | null;
          old_period: string | null;
          new_period: string | null;
          old_mode: string | null;
          new_mode: string | null;
          old_status: string | null;
          new_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id: string;
          changed_at?: string;
          old_target?: number | null;
          new_target?: number | null;
          old_period?: string | null;
          new_period?: string | null;
          old_mode?: string | null;
          new_mode?: string | null;
          old_status?: string | null;
          new_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          changed_at?: string;
          old_target?: number | null;
          new_target?: number | null;
          old_period?: string | null;
          new_period?: string | null;
          old_mode?: string | null;
          new_mode?: string | null;
          old_status?: string | null;
          new_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_changes_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goal_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_milestones: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          title: string;
          target_value: number | null;
          due_on: string | null;
          achieved_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id: string;
          title: string;
          target_value?: number | null;
          due_on?: string | null;
          achieved_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          title?: string;
          target_value?: number | null;
          due_on?: string | null;
          achieved_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_milestones_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goal_milestones_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_progress_entries: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string;
          recorded_on: string;
          amount: number;
          note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id: string;
          recorded_on?: string;
          amount: number;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string;
          recorded_on?: string;
          amount?: number;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_progress_entries_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goal_progress_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          status: string;
          progress_mode: string;
          target_value: number;
          unit: string;
          subject_id: string | null;
          project_id: string | null;
          activity_category_id: string | null;
          habit_id: string | null;
          start_on: string;
          due_on: string | null;
          created_at: string;
          updated_at: string;
          period: string;
          activity_kind: string | null;
          archived_at: string | null;
          linked_tasks_only: boolean;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          description?: string;
          status?: string;
          progress_mode?: string;
          target_value: number;
          unit: string;
          subject_id?: string | null;
          project_id?: string | null;
          activity_category_id?: string | null;
          habit_id?: string | null;
          start_on?: string;
          due_on?: string | null;
          created_at?: string;
          updated_at?: string;
          period?: string;
          activity_kind?: string | null;
          archived_at?: string | null;
          linked_tasks_only?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          status?: string;
          progress_mode?: string;
          target_value?: number;
          unit?: string;
          subject_id?: string | null;
          project_id?: string | null;
          activity_category_id?: string | null;
          habit_id?: string | null;
          start_on?: string;
          due_on?: string | null;
          created_at?: string;
          updated_at?: string;
          period?: string;
          activity_kind?: string | null;
          archived_at?: string | null;
          linked_tasks_only?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_category_fk';
            columns: ['activity_category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'activity_categories';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goals_habit_fk';
            columns: ['habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goals_project_fk';
            columns: ['project_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goals_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_checkins: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          local_date: string;
          value: number | null;
          note: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          habit_id: string;
          local_date: string;
          value?: number | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          habit_id?: string;
          local_date?: string;
          value?: number | null;
          note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_checkins_habit_fk';
            columns: ['habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'habit_checkins_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          schedule_kind: string;
          weekdays: number[] | null;
          times_per_week: number | null;
          target_value: number | null;
          unit: string | null;
          start_on: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string;
          schedule_kind?: string;
          weekdays?: number[] | null;
          times_per_week?: number | null;
          target_value?: number | null;
          unit?: string | null;
          start_on?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          schedule_kind?: string;
          weekdays?: number[] | null;
          times_per_week?: number | null;
          target_value?: number | null;
          unit?: string | null;
          start_on?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habits_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      learning_notes: {
        Row: {
          id: string;
          user_id: string;
          subject_id: string;
          topic_id: string | null;
          title: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          subject_id: string;
          topic_id?: string | null;
          title: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          subject_id?: string;
          topic_id?: string | null;
          title?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_notes_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'learning_notes_topic_fk';
            columns: ['topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'learning_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      planning_preferences: {
        Row: {
          user_id: string;
          break_minutes: number;
          min_block_minutes: number;
          max_block_minutes: number;
          preferred_period: string;
          daily_load_limit_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          break_minutes?: number;
          min_block_minutes?: number;
          max_block_minutes?: number;
          preferred_period?: string;
          daily_load_limit_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          break_minutes?: number;
          min_block_minutes?: number;
          max_block_minutes?: number;
          preferred_period?: string;
          daily_load_limit_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'planning_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          timezone: string;
          week_starts_on: number;
          theme_preference: string;
          email_notifications: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          timezone?: string;
          week_starts_on?: number;
          theme_preference?: string;
          email_notifications?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          timezone?: string;
          week_starts_on?: number;
          theme_preference?: string;
          email_notifications?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_milestones: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          title: string;
          due_on: string | null;
          completed_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          project_id: string;
          title: string;
          due_on?: string | null;
          completed_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          title?: string;
          due_on?: string | null;
          completed_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_milestones_project_fk';
            columns: ['project_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'project_milestones_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      project_status_history: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          from_status: string | null;
          to_status: string;
          changed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          project_id: string;
          from_status?: string | null;
          to_status: string;
          changed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string;
          from_status?: string | null;
          to_status?: string;
          changed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_status_history_project_fk';
            columns: ['project_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'project_status_history_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          status: string;
          start_on: string | null;
          due_on: string | null;
          completed_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          priority: string;
          notes: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          description?: string;
          status?: string;
          start_on?: string | null;
          due_on?: string | null;
          completed_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          priority?: string;
          notes?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          status?: string;
          start_on?: string | null;
          due_on?: string | null;
          completed_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          priority?: string;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          rule_id: string;
          title: string;
          rationale: string;
          evidence: Json;
          status: string;
          generated_at: string;
          expires_at: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
          updated_at: string;
          dedup_key: string;
          priority: number;
          action: Json | null;
          snoozed_until: string | null;
          closed_at: string | null;
          close_reason: string | null;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          rule_id: string;
          title: string;
          rationale: string;
          evidence?: Json;
          status?: string;
          generated_at?: string;
          expires_at?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
          dedup_key?: string;
          priority?: number;
          action?: Json | null;
          snoozed_until?: string | null;
          closed_at?: string | null;
          close_reason?: string | null;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          rule_id?: string;
          title?: string;
          rationale?: string;
          evidence?: Json;
          status?: string;
          generated_at?: string;
          expires_at?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
          updated_at?: string;
          dedup_key?: string;
          priority?: number;
          action?: Json | null;
          snoozed_until?: string | null;
          closed_at?: string | null;
          close_reason?: string | null;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recommendations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          remind_at: string;
          channel: string;
          task_id: string | null;
          calendar_event_id: string | null;
          habit_id: string | null;
          review_card_id: string | null;
          sent_at: string | null;
          dismissed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          title: string;
          remind_at: string;
          channel?: string;
          task_id?: string | null;
          calendar_event_id?: string | null;
          habit_id?: string | null;
          review_card_id?: string | null;
          sent_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          remind_at?: string;
          channel?: string;
          task_id?: string | null;
          calendar_event_id?: string | null;
          habit_id?: string | null;
          review_card_id?: string | null;
          sent_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_event_fk';
            columns: ['calendar_event_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_events';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'reminders_habit_fk';
            columns: ['habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'reminders_review_card_fk';
            columns: ['review_card_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'review_cards';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'reminders_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'reminders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_attempts: {
        Row: {
          id: string;
          user_id: string;
          review_card_id: string;
          reviewed_at: string;
          grade: number;
          duration_seconds: number | null;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          review_card_id: string;
          reviewed_at?: string;
          grade: number;
          duration_seconds?: number | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_card_id?: string;
          reviewed_at?: string;
          grade?: number;
          duration_seconds?: number | null;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_attempts_card_fk';
            columns: ['review_card_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'review_cards';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'review_attempts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_cards: {
        Row: {
          id: string;
          user_id: string;
          topic_id: string;
          status: string;
          due_on: string;
          interval_days: number;
          repetitions: number;
          last_reviewed_at: string | null;
          created_at: string;
          updated_at: string;
          priority: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          topic_id: string;
          status?: string;
          due_on: string;
          interval_days?: number;
          repetitions?: number;
          last_reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          priority?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          topic_id?: string;
          status?: string;
          due_on?: string;
          interval_days?: number;
          repetitions?: number;
          last_reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          priority?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_cards_topic_fk';
            columns: ['topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'review_cards_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      review_schedule_log: {
        Row: {
          id: string;
          user_id: string;
          review_card_id: string;
          from_due_on: string | null;
          to_due_on: string;
          reason: string;
          changed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          review_card_id: string;
          from_due_on?: string | null;
          to_due_on: string;
          reason: string;
          changed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_card_id?: string;
          from_due_on?: string | null;
          to_due_on?: string;
          reason?: string;
          changed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_schedule_log_card_fk';
            columns: ['review_card_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'review_cards';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'review_schedule_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      session_pauses: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          started_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          session_id: string;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_pauses_session_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'focus_sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'session_pauses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      session_reflections: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          studied: string;
          understood: string;
          confusing: string;
          questions_count: number;
          correct_count: number;
          perceived_difficulty: number | null;
          next_action: string;
          suggested_review_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          session_id: string;
          studied?: string;
          understood?: string;
          confusing?: string;
          questions_count?: number;
          correct_count?: number;
          perceived_difficulty?: number | null;
          next_action?: string;
          suggested_review_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          studied?: string;
          understood?: string;
          confusing?: string;
          questions_count?: number;
          correct_count?: number;
          perceived_difficulty?: number | null;
          next_action?: string;
          suggested_review_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_reflections_session_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'focus_sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'session_reflections_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subjects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          term: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          description: string;
          objective: string;
          target_minutes_per_week: number | null;
          status: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          color?: string | null;
          term?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string;
          objective?: string;
          target_minutes_per_week?: number | null;
          status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
          term?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string;
          objective?: string;
          target_minutes_per_week?: number | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subjects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      task_dependencies: {
        Row: {
          task_id: string;
          depends_on_task_id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          task_id: string;
          depends_on_task_id: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          task_id?: string;
          depends_on_task_id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_dependencies_depends_on_fk';
            columns: ['depends_on_task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'task_dependencies_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'task_dependencies_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          parent_task_id: string | null;
          title: string;
          notes: string;
          status: string;
          priority: string;
          due_on: string | null;
          estimate_minutes: number | null;
          sort_order: number;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          description: string;
          start_on: string | null;
          category_id: string | null;
          started_at: string | null;
          cancelled_at: string | null;
          goal_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          parent_task_id?: string | null;
          title: string;
          notes?: string;
          status?: string;
          priority?: string;
          due_on?: string | null;
          estimate_minutes?: number | null;
          sort_order?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string;
          start_on?: string | null;
          category_id?: string | null;
          started_at?: string | null;
          cancelled_at?: string | null;
          goal_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          parent_task_id?: string | null;
          title?: string;
          notes?: string;
          status?: string;
          priority?: string;
          due_on?: string | null;
          estimate_minutes?: number | null;
          sort_order?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description?: string;
          start_on?: string | null;
          category_id?: string | null;
          started_at?: string | null;
          cancelled_at?: string | null;
          goal_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_category_fk';
            columns: ['category_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'activity_categories';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'tasks_goal_fk';
            columns: ['goal_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'tasks_parent_fk';
            columns: ['parent_task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'tasks_project_fk';
            columns: ['project_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'tasks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      topic_mastery_events: {
        Row: {
          id: string;
          user_id: string;
          topic_id: string;
          level: number;
          source: string;
          session_id: string | null;
          review_attempt_id: string | null;
          note: string;
          recorded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          topic_id: string;
          level: number;
          source?: string;
          session_id?: string | null;
          review_attempt_id?: string | null;
          note?: string;
          recorded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          topic_id?: string;
          level?: number;
          source?: string;
          session_id?: string | null;
          review_attempt_id?: string | null;
          note?: string;
          recorded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'topic_mastery_events_attempt_fk';
            columns: ['review_attempt_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'review_attempts';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'topic_mastery_events_session_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'focus_sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'topic_mastery_events_topic_fk';
            columns: ['topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'topic_mastery_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      topics: {
        Row: {
          id: string;
          user_id: string;
          subject_id: string;
          name: string;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          parent_topic_id: string | null;
          description: string;
          priority: string;
          difficulty: number | null;
          notes: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          subject_id: string;
          name: string;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          parent_topic_id?: string | null;
          description?: string;
          priority?: string;
          difficulty?: number | null;
          notes?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          subject_id?: string;
          name?: string;
          sort_order?: number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          parent_topic_id?: string | null;
          description?: string;
          priority?: string;
          difficulty?: number | null;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'topics_parent_fk';
            columns: ['parent_topic_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'topics';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'topics_subject_fk';
            columns: ['subject_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'subjects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'topics_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      weekly_review_priorities: {
        Row: {
          id: string;
          user_id: string;
          review_id: string;
          position: number;
          title: string;
          task_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          review_id: string;
          position?: number;
          title: string;
          task_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_id?: string;
          position?: number;
          title?: string;
          task_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'weekly_review_priorities_review_fk';
            columns: ['review_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'weekly_reviews';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'weekly_review_priorities_task_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'weekly_review_priorities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      weekly_reviews: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          week_start: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'weekly_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      complete_focus_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Database['public']['Tables']['activities']['Row'];
      };
      complete_focus_session_at: {
        Args: {
          p_session_id: string;
          p_ended_at: string;
        };
        Returns: Database['public']['Tables']['activities']['Row'];
      };
      complete_review: {
        Args: {
          p_card_id: string;
          p_grade: number;
          p_duration_seconds?: number;
          p_notes?: string;
        };
        Returns: Database['public']['Tables']['review_cards']['Row'];
      };
      complete_task: {
        Args: {
          p_task_id: string;
          p_include_subtasks?: boolean;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      correct_focus_session: {
        Args: {
          p_session_id: string;
          p_started_at: string;
          p_ended_at: string;
        };
        Returns: Database['public']['Tables']['activities']['Row'];
      };
      dashboard_summary: {
        Args: {
          p_now?: string;
        };
        Returns: Json;
      };
      delete_my_account: {
        Args: never;
        Returns: undefined;
      };
      discard_focus_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Database['public']['Tables']['focus_sessions']['Row'];
      };
      export_my_data: {
        Args: never;
        Returns: Json;
      };
      goal_history: {
        Args: {
          p_goal_id: string;
          p_cycles?: number;
          p_now?: string;
        };
        Returns: { cycle_start: string; cycle_end: string; value: number }[];
      };
      goal_progress: {
        Args: {
          p_now?: string;
        };
        Returns: {
          goal_id: string;
          cycle_start: string;
          cycle_end: string;
          current_value: number;
          target_value: number;
        }[];
      };
      pause_focus_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Database['public']['Tables']['session_pauses']['Row'];
      };
      postpone_review: {
        Args: {
          p_card_id: string;
          p_days?: number;
        };
        Returns: Database['public']['Tables']['review_cards']['Row'];
      };
      reschedule_review: {
        Args: {
          p_card_id: string;
          p_due_on: string;
        };
        Returns: Database['public']['Tables']['review_cards']['Row'];
      };
      resume_focus_session: {
        Args: {
          p_session_id: string;
        };
        Returns: Database['public']['Tables']['session_pauses']['Row'];
      };
      save_session_reflection: {
        Args: {
          p_session_id: string;
          p_studied?: string;
          p_understood?: string;
          p_confusing?: string;
          p_questions_count?: number;
          p_correct_count?: number;
          p_perceived_difficulty?: number;
          p_next_action?: string;
          p_suggested_review_on?: string;
        };
        Returns: Database['public']['Tables']['session_reflections']['Row'];
      };
      start_focus_session: {
        Args: {
          p_subject_id?: string;
          p_topic_id?: string;
          p_task_id?: string;
          p_planned_seconds?: number;
          p_technique?: string;
        };
        Returns: Database['public']['Tables']['focus_sessions']['Row'];
      };
      stats_activities: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      stats_goals: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      stats_study: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      stats_tasks: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      study_time_by_subject: {
        Args: {
          p_from: string;
          p_to: string;
        };
        Returns: { subject_id: string; seconds: number }[];
      };
      sync_recommendations: {
        Args: {
          p_candidates: Json;
          p_rules: string[];
        };
        Returns: Json;
      };
      task_time_totals: {
        Args: {
          p_task_ids: string[];
        };
        Returns: { task_id: string; seconds: number; activities: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
