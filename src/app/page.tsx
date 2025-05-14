"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Building2, Search, Loader2, AlertCircle, Mail, ClipboardCopy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { extractEmailFromCompany, type ExtractEmailFromCompanyOutput } from "@/ai/flows/extract-email-from-company";

const formSchema = z.object({
  companyInfo: z.string().min(3, {
    message: "Company name or website URL must be at least 3 characters.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProspectorAIPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extractionResult, setExtractionResult] = React.useState<ExtractEmailFromCompanyOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyInfo: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setError(null);
    setExtractionResult(null);

    try {
      const result = await extractEmailFromCompany({ companyInfo: values.companyInfo });
      setExtractionResult(result);
      if (result.emailAddresses.length === 0) {
        toast({
          title: "No Emails Found",
          description: "We couldn't find any email addresses for the provided company.",
        });
      }
    } catch (err) {
      console.error("Error extracting emails:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to extract emails: ${errorMessage}`,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email)
      .then(() => {
        toast({
          title: "Copied!",
          description: `${email} copied to clipboard.`,
        });
      })
      .catch(err => {
        console.error("Failed to copy email:", err);
        toast({
          variant: "destructive",
          title: "Copy Failed",
          description: "Could not copy email to clipboard.",
        });
      });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 selection:bg-accent selection:text-accent-foreground">
      <header className="mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Building2 className="h-12 w-12 mr-3 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-primary">ProspectorAI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Find B2B email addresses with the power of AI.
        </p>
      </header>

      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Enter Company Details</CardTitle>
          <CardDescription>
            Provide a company name or website URL to find associated email addresses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="companyInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="companyInfoInput" className="text-base">Company Name or Website URL</FormLabel>
                    <FormControl>
                      <Input 
                        id="companyInfoInput"
                        placeholder="e.g., example.com or Example Inc." 
                        {...field}
                        className="text-base py-3 px-4"
                        aria-label="Company Name or Website URL"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Search className="mr-2 h-5 w-5" />
                )}
                Find Emails
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-3" />
          <p className="text-lg">Searching for emails...</p>
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive" className="mt-8 w-full max-w-2xl">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {extractionResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Extracted Emails</CardTitle>
            {extractionResult.reasoning && (
              <CardDescription className="italic text-sm pt-1">
                 {extractionResult.reasoning}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {extractionResult.emailAddresses.length > 0 ? (
              <ul className="space-y-3">
                {extractionResult.emailAddresses.map((email, index) => (
                  <li key={index} className="flex items-center justify-between p-3 bg-secondary/50 rounded-md">
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 mr-3 text-primary" />
                      <span className="text-base text-foreground">{email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyEmail(email)}
                      className="text-muted-foreground hover:text-accent"
                      aria-label={`Copy email ${email}`}
                    >
                      <ClipboardCopy className="h-5 w-5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base text-center text-muted-foreground py-4">
                No email addresses found for the provided company.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
