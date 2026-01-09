import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const phoneSchema = z
  .string()
  .trim()
  .min(8, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .regex(/^\+?[0-9]{8,15}$/, "Enter a valid phone number");

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type ContactResult = {
  contactUserId: string;
  name: string;
};

export const validatePhoneNumber = (value: string) => {
  return phoneSchema.parse(value.replace(/\s+/g, ""));
};

export const addContactByPhone = async (
  currentUserId: string,
  rawPhone: string
): Promise<ContactResult> => {
  const normalized = validatePhoneNumber(rawPhone);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone_number")
    .eq("phone_number", normalized)
    .maybeSingle<Pick<ProfileRow, "id" | "full_name" | "phone_number">>();

  if (error) throw error;

  if (!profile) {
    throw new Error("This person has not joined SplitStuff yet.");
  }

  const { error: insertError } = await supabase.from("contacts").insert({
    user_id: currentUserId,
    contact_user_id: profile.id,
  });

  if (insertError && insertError.code !== "23505") {
    // 23505 = unique_violation (already a contact)
    throw insertError;
  }

  return {
    contactUserId: profile.id,
    name: profile.full_name || "Friend",
  };
};

export const fetchContacts = async (
  currentUserId: string
): Promise<ContactResult[]> => {
  const { data, error } = await supabase
    .from("contacts")
    .select("contact_user_id, profiles!contacts_contact_user_id_fkey(full_name)")
    .eq("user_id", currentUserId);

  if (error) throw error;

  return (
    data?.map((row: any) => ({
      contactUserId: row.contact_user_id as string,
      name: (row.profiles?.full_name as string) || "Friend",
    })) ?? []
  );
};
