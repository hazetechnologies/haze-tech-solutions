import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!serviceKey) {
    return res.status(500).json({ error: 'Service role key not configured' })
  }

  // Verify caller is authenticated
  const userClient = createClient(supabaseUrl, anonKey)
  const { data: { user: caller }, error: authError } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''))

  if (authError || !caller) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Admin client with service role
  const adminClient = createClient(supabaseUrl, serviceKey)

  // Check caller is admin (not in clients table)
  const { data: callerClient } = await adminClient
    .from('clients')
    .select('id')
    .eq('user_id', caller.id)
    .maybeSingle()

  if (callerClient) {
    return res.status(403).json({ error: 'Only admins can create clients' })
  }

  const { name, email, password, company, phone, product, price, subscription_terms } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' })
  }

  try {
    // Create auth user
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      return res.status(400).json({ error: createError.message })
    }

    // Insert client record
    const { data: client, error: insertError } = await adminClient
      .from('clients')
      .insert({
        user_id: authData.user.id,
        name,
        email,
        company: company || null,
        phone: phone || null,
        product: product || null,
        price: price ? Number(price) : null,
        subscription_terms: subscription_terms || null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback: delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return res.status(400).json({ error: insertError.message })
    }

    return res.status(200).json({ client })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
