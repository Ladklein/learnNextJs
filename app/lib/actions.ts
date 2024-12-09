'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import pg from 'pg';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const { Client } = pg
  
const client = new Client({
  connectionString: process.env.POSTGRES_URL ?? ''
});

await client.connect();

export type State = {
    errors?: {
      customerId?: string[];
      amount?: string[];
      status?: string[];
    };
    message?: string | null;
  };

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
      invalid_type_error: 'Please select a customer.',
    }),
    amount: z.coerce
      .number()
      .gt(0, { message: 'Please enter an amount greater than $0.' }),
    status: z.enum(['pending', 'paid'], {
      invalid_type_error: 'Please select an invoice status.',
    }),
    date: z.string(),
});
 
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(_prevState: State, formData: FormData) {
    try {
        const validatedFields = CreateInvoice.safeParse({
            customerId: formData.get('customerId'),
            amount: formData.get('amount'),
            status: formData.get('status'),
        });

        if (!validatedFields.success) {
            return {
              errors: validatedFields.error.flatten().fieldErrors,
              message: 'Missing Fields. Failed to Create Invoice.',
            };
        }

        const { customerId, amount, status } = validatedFields.data;
        const amountInCents = amount * 100;
        const date = new Date().toISOString().split('T')[0];

        console.log({ customerId, amount, status })
        
        await client.query(`
            INSERT INTO invoices (customer_id, amount, status, date)
           VALUES ('${customerId}', ${amountInCents}, '${status}', '${date}')
        `);
    } catch (_) {
        return {
            message: 'Database Error: Failed to Create Invoice.',
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
    try {
        const { customerId, amount, status } = UpdateInvoice.parse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
        });
    
        const amountInCents = amount * 100;
    
        await client.query(`
        UPDATE invoices
        SET customer_id = '${customerId}', amount = ${amountInCents}, status = '${status}'
        WHERE id = '${id}'
        `);
    } catch (_) {
        return {
            message: 'Database Error: Failed to Update Invoice.',
        };
    }

    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
  }

  export async function deleteInvoice(id: string) {
    try {
        await client.query(`DELETE FROM invoices WHERE id = '${id}'`);
    } catch(_) {
        return {
            message: 'Database Error: Failed to Delete Invoice.',
        };
    }

    revalidatePath('/dashboard/invoices');
  }

export async function authenticate(
    _prevState: string | undefined,
    formData: FormData,
) {
    try {
    await signIn('credentials', formData);
    } catch (error) {
    if (error instanceof AuthError) {
        switch (error.type) {
        case 'CredentialsSignin':
            return 'Invalid credentials.';
        default:
            return 'Something went wrong.';
        }
    }
    throw error;
    }
}