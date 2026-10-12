// Fields the signup trigger (handle_new_user) reads from auth user metadata.
export type SignupMetadata = {
  name: string;
  student_number: string | null;
  phone: string;
  privacy_consent: true;
};
