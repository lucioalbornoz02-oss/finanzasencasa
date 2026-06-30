import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wvqqinrjlnokgzuszuqe.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXFpbnJqbG5va2d6dXN6dXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzgxNDUsImV4cCI6MjA5NzM1NDE0NX0.0wg4aNXkBMwRh9yUKrmRAA_H9DNvdCvjvkpWP9UGMB0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
