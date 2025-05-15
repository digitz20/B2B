
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Building2, Search, Loader2, AlertCircle, Mail, ClipboardCopy, Briefcase, Copy, XCircle } from "lucide-react"; // Changed CopyAll to Copy

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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

  const searchCriteriaValue = form.watch("searchCriteria");

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
          variant: "default",
        });
      } else {
        toast({
          title: "Contacts Found!",
          description: `Found ${result.emailAddresses.length} email address(es).`,
          variant: "default",
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

  const handleCopyAllEmails = () => {
    if (searchResult && searchResult.emailAddresses.length > 0) {
      const allEmails = searchResult.emailAddresses.join("\n");
      navigator.clipboard.writeText(allEmails)
        .then(() => {
          toast({
            title: "All Copied!",
            description: `${searchResult.emailAddresses.length} email addresses copied to clipboard.`,
          });
        })
        .catch(err => {
          console.error("Failed to copy all emails:", err);
          toast({
            variant: "destructive",
            title: "Copy Failed",
            description: "Could not copy all emails to clipboard.",
          });
        });
    }
  };

  const handleClearAll = () => {
    form.reset({ searchCriteria: "" });
    setSearchResult(null);
    setError(null);
    toast({
      title: "Cleared",
      description: "Search input and results have been cleared.",
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
                      <div className="relative">
                        <Input 
                          id="searchCriteriaInput"
                          placeholder="e.g., 'AI startups', 'plumbers in San Francisco', 'sustainable energy companies'" 
                          {...field}
                          className="text-base py-3 px-4 pr-10" // Added pr-10 for clear button spacing
                          aria-label="Profession, Industry, or Work Aspect"
                        />
                        {searchCriteriaValue && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => form.setValue('searchCriteria', '')}
                            aria-label="Clear search input"
                          >
                            <XCircle className="h-5 w-5" />
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-5 w-5" />
                  )}
                  Find Contacts
                </Button>
                {(searchCriteriaValue || searchResult || error) && (
                   <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full sm:w-auto text-base py-3" 
                    onClick={handleClearAll}
                    disabled={isLoading}
                  >
                    <XCircle className="mr-2 h-5 w-5" />
                    Clear All
                  </Button>
                )}
              </div>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Found Contacts</CardTitle>
              {searchResult.reasoning && (
                <CardDescription className="italic text-sm pt-1">
                  {searchResult.reasoning}
                </CardDescription>
              )}
            </div>
            {searchResult.emailAddresses.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAllEmails}
                className="ml-auto"
                aria-label="Copy all found email addresses"
              >
                <Copy className="mr-2 h-4 w-4" /> {/* Changed CopyAll to Copy */}
                Copy All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {searchResult.emailAddresses.length > 0 ? (
              <ul className="space-y-3">
                {searchResult.emailAddresses.map((email, index) => (
                  <li key={index} className="flex items-center justify-between p-3 bg-secondary/50 rounded-md">
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 mr-3 text-primary" />
                      <span className="text-base text-foreground break-all">{email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyEmail(email)}
                      className="text-muted-foreground hover:text-accent ml-2 shrink-0"
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
