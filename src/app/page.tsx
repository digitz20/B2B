"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Building2, Search, Loader2, AlertCircle, Mail, ClipboardCopy, Briefcase } from "lucide-react";

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
import { findEmailsByCriteria, type FindEmailsByCriteriaOutput } from "@/ai/flows/find-emails-by-criteria";

const formSchema = z.object({
  searchCriteria: z.string().min(3, {
    message: "Search criteria must be at least 3 characters.",
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function ContactFinderAIPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchResult, setSearchResult] = React.useState<FindEmailsByCriteriaOutput | null>(null);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      searchCriteria: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setError(null);
    setSearchResult(null);

    try {
      const result = await findEmailsByCriteria({ searchCriteria: values.searchCriteria });
      setSearchResult(result);
      if (result.emailAddresses.length === 0) {
        toast({
          title: "No Contacts Found",
          description: "We couldn't find any email addresses for the provided criteria.",
        });
      }
    } catch (err) {
      console.error("Error finding contacts:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to find contacts: ${errorMessage}`,
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
          <Briefcase className="h-12 w-12 mr-3 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-primary">ContactFinder AI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Discover B2B email addresses by profession or industry using AI.
        </p>
      </header>

      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Find Business Contacts</CardTitle>
          <CardDescription>
            Enter a profession, industry, or work aspect to find relevant email addresses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="searchCriteria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="searchCriteriaInput" className="text-base">Profession, Industry, or Work Aspect</FormLabel>
                    <FormControl>
                      <Input 
                        id="searchCriteriaInput"
                        placeholder="e.g., 'AI startups', 'plumbers in San Francisco', 'sustainable energy companies'" 
                        {...field}
                        className="text-base py-3 px-4"
                        aria-label="Profession, Industry, or Work Aspect"
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
                Find Contacts
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-3" />
          <p className="text-lg">Searching for contacts...</p>
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive" className="mt-8 w-full max-w-2xl">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {searchResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">Found Contacts</CardTitle>
            {searchResult.reasoning && (
              <CardDescription className="italic text-sm pt-1">
                 {searchResult.reasoning}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {searchResult.emailAddresses.length > 0 ? (
              <ul className="space-y-3">
                {searchResult.emailAddresses.map((email, index) => (
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
                No email addresses found for the provided criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
