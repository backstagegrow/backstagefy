Deno.serve(async (req) => {
    return new Response(JSON.stringify({
        S_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        S_URL: Deno.env.get('SUPABASE_URL')
    }), { headers: { "Content-Type": "application/json" } });
});
