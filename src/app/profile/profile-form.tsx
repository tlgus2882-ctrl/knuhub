"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfile, type ProfileFormState } from "./actions";
import {
  CONTACT_VISIBILITY_HINT,
  CONTACT_VISIBILITY_LABEL,
  type ContactSettings,
  type ContactVisibility,
} from "./contact-visibility";

const initial: ProfileFormState = { error: null };

type Props = {
  email: string;
  name: string;
  contact: ContactSettings;
};

export function ProfileForm({ email, name, contact }: Props) {
  const [state, action, pending] = useActionState(saveProfile, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">연락 수단</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="show_email" defaultChecked={contact.show_email} />
          학교 메일 보이기 <span className="text-muted-foreground">({email})</span>
        </label>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="open_chat_url">카카오톡 오픈채팅 링크</Label>
          <Input
            id="open_chat_url"
            name="open_chat_url"
            type="url"
            defaultValue={contact.open_chat_url ?? ""}
            placeholder="https://open.kakao.com/o/…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="github">GitHub 아이디</Label>
          <Input id="github" name="github" defaultValue={contact.github ?? ""} placeholder="knu-dev" />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">연락처 공개 범위</legend>
        {(Object.keys(CONTACT_VISIBILITY_LABEL) as ContactVisibility[]).map((value) => (
          <label key={value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="contact_visibility"
              value={value}
              defaultChecked={contact.contact_visibility === value}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{CONTACT_VISIBILITY_LABEL[value]}</span>
              <span className="block text-xs text-muted-foreground">{CONTACT_VISIBILITY_HINT[value]}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">이름과 학번은 작성자 카드에 항상 보여요. 전화번호는 보이지 않아요.</p>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.savedAt && !state.error && <p className="text-sm text-muted-foreground">저장했어요.</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "저장 중…" : "저장"}
      </Button>
    </form>
  );
}
