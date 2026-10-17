# Dashboard de Vencimentos (React + Vite + Supabase)

## 1. Banco de dados (Supabase, grátis)
1. Crie um projeto em supabase.com.
2. SQL Editor > New query > cole o conteúdo de `supabase.sql` > Run.
3. (Opcional) Authentication > Providers > Email: desative "Confirm email" para entrar logo após criar a conta.
4. Project Settings > API: copie a Project URL e a chave anon public.

## 2. Rodar local
cp .env.example .env   # preencha com a URL e a chave
npm install
npm run dev

## 3. Deploy na Vercel (grátis)
1. Suba a pasta para o GitHub e importe o repositório na Vercel.
2. Em Environment Variables, adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
3. Deploy. Depois, em Supabase > Authentication > URL Configuration, coloque a URL da Vercel em Site URL.
# dashboard-clientes-app
