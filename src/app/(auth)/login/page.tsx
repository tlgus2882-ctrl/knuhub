import { LoginCard } from "./login-card";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return <LoginCard searchParams={searchParams} />;
}
