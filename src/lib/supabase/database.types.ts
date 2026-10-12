
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "assignment": {
                  Row: {
                    "course_id": string,"created_at": string,"created_by": string | null,"description": string,"due_at": string,"id": string,"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_at": string,"id"?: string,"title": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"due_at"?: string,"id"?: string,"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignment_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "course"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assignment_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"course": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"professor_id": string,"section": string,"semester": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"professor_id"?: string,"section": string,"semester": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"professor_id"?: string,"section"?: string,"semester"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_professor_id_fkey"
      columns: ["professor_id"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"course_assistant": {
                  Row: {
                    "course_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_assistant_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: true
      referencedRelation: "enrollment"
      referencedColumns: ["course_id","student_id"]
    }
                  ]
                },"course_invite": {
                  Row: {
                    "course_id": string,"invite_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"invite_code": string
                  }
                  Update: {
                    "course_id"?: string,"invite_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_invite_course_id_fkey"
      columns: ["course_id"]
isOneToOne: true
      referencedRelation: "course"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollment": {
                  Row: {
                    "course_id": string,"created_at": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"created_at"?: string,"student_id": string
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollment_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "course"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollment_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"profile": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"role": Database["public"]['Enums']["role"],"student_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"name": string,"role"?: Database["public"]['Enums']["role"],"student_number"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"role"?: Database["public"]['Enums']["role"],"student_number"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profile_private": {
                  Row: {
                    "id": string,"pending_student_number": string | null,"phone": string,"privacy_consented_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"pending_student_number"?: string | null,"phone": string,"privacy_consented_at": string
                  }
                  Update: {
                    "id"?: string,"pending_student_number"?: string | null,"phone"?: string,"privacy_consented_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_private_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"submission": {
                  Row: {
                    "assignment_id": string,"id": string,"student_id": string,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"id"?: string,"student_id": string,"submitted_at"?: string
                  }
                  Update: {
                    "assignment_id"?: string,"id"?: string,"student_id"?: string,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignment"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profile"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_file": {
                  Row: {
                    "id": string,"kind": Database["public"]['Enums']["file_kind"],"path": string,"size": number,"storage_path": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"path": string,"size": number,"storage_path": string,"submission_id": string
                  }
                  Update: {
                    "id"?: string,"kind"?: Database["public"]['Enums']["file_kind"],"path"?: string,"size"?: number,"storage_path"?: string,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_file_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submission"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "assert_school_email":
{ Args: { "email": string }; Returns: undefined
                           },
"can_read_submission_object":
{ Args: { "object_name": string }; Returns: boolean
                           },
"can_submit":
{ Args: { "target_assignment": string }; Returns: boolean
                           },
"can_view_submission":
{ Args: { "target_submission": string }; Returns: boolean
                           },
"can_write_submission_object":
{ Args: { "object_name": string }; Returns: boolean
                           },
"course_roster":
{ Args: { "target_course": string }; Returns: {
              "email": string,"is_assistant": boolean,"name": string,"student_id": string,"student_number": string
            }[]
                           },
"delete_submission":
{ Args: { "target_assignment": string }; Returns: (string)[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_course_professor":
{ Args: { "target_course": string }; Returns: boolean
                           },
"is_enrolled":
{ Args: { "target_course": string }; Returns: boolean
                           },
"is_professor":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_professor_or_assistant":
{ Args: { "target_course": string }; Returns: boolean
                           },
"is_submitted_object":
{ Args: { "object_name": string }; Returns: boolean
                           },
"issue_invite_code":
{ Args: { "target_course": string }; Returns: string
                           },
"join_course":
{ Args: { "code": string }; Returns: string
                           },
"login_email_for_student_number":
{ Args: { "candidate": string }; Returns: string
                           },
"my_course_role":
{ Args: { "target_course": string }; Returns: string
                           },
"new_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"regenerate_invite_code":
{ Args: { "target_course": string }; Returns: string
                           },
"student_number_taken":
{ Args: { "candidate": string }; Returns: boolean
                           },
"submit_files":
{ Args: { "files": Json,"target_assignment": string }; Returns: (string)[]
                           }
          }
          Enums: {
            "file_kind": "text"|"binary","role": "student"|"professor"|"admin","visibility": "private"|"course"|"campus"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "file_kind": ["text", "binary"],"role": ["student", "professor", "admin"],"visibility": ["private", "course", "campus"]
          }
        }
} as const
