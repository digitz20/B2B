
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Briefcase, Search, Loader2, AlertCircle, Mail, ClipboardCopy, Copy, XCircle, FileText } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import { findEmailsByCriteria, type FindEmailsByCriteriaOutput } from "@/ai/flows/find-emails-by-criteria";
import { extractEmailsFromText, type ExtractEmailsFromTextOutput, type ExtractEmailsFromTextInput } from "@/ai/flows/extract-emails-from-text";

const findContactsFormSchema = z.object({
  searchCriteria: z.string().min(3, {
    message: "Search criteria must be at least 3 characters.",
  }),
});
type FindContactsFormValues = z.infer<typeof findContactsFormSchema>;

const extractEmailsFormSchema = z.object({
  textBlock: z.string().min(1, {
    message: "Please enter some text to extract emails from.",
  }),
});
type ExtractEmailsFormValues = z.infer<typeof extractEmailsFormSchema>;

export default function ContactFinderAIPage() {
  const [activeTab, setActiveTab] = React.useState<"find" | "extract">("find");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const [findContactsResult, setFindContactsResult] = React.useState<FindEmailsByCriteriaOutput | null>(null);
  const [extractionResult, setExtractionResult] = React.useState<ExtractEmailsFromTextOutput | null>(null);
  
  const { toast } = useToast();

  const findContactsForm = useForm<FindContactsFormValues>({
    resolver: zodResolver(findContactsFormSchema),
    defaultValues: {
      searchCriteria: "",
    },
  });

  const extractEmailsForm = useForm<ExtractEmailsFormValues>({
    resolver: zodResolver(extractEmailsFormSchema),
    defaultValues: {
      textBlock: "",
    },
  });

  const searchCriteriaValue = findContactsForm.watch("searchCriteria");
  const textBlockValue = extractEmailsForm.watch("textBlock");

  async function onSubmitFindContacts(values: FindContactsFormValues) {
    setIsLoading(true);
    setError(null);
    setFindContactsResult(null);

    try {
      const result = await findEmailsByCriteria({ searchCriteria: values.searchCriteria });
      setFindContactsResult(result);
      if (result.emailAddresses.length === 0) {
        toast({
          title: "No Contacts Found",
          description: "We couldn't find any email addresses for the provided criteria.",
        });
      } else {
        toast({
          title: "Contacts Found!",
          description: `Found ${result.emailAddresses.length} email address(es).`,
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

  async function onSubmitExtractEmails(values: ExtractEmailsFormValues) {
    setIsLoading(true);
    setError(null);
    setExtractionResult(null);

    try {
      const result = await extractEmailsFromText({ textBlock: values.textBlock });
      setExtractionResult(result);
      if (result.extractedEmails.length === 0) {
        toast({
          title: "No Emails Extracted",
          description: result.extractionSummary || "Could not find any email addresses in the provided text.",
        });
      } else {
        toast({
          title: "Emails Extracted!",
          description: result.extractionSummary || `Successfully extracted ${result.extractedEmails.length} email address(es).`,
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

  const handleCopyAllEmails = (emails: string[]) => {
    if (emails && emails.length > 0) {
      const allEmails = emails.join("\n");
      navigator.clipboard.writeText(allEmails)
        .then(() => {
          toast({
            title: "All Copied!",
            description: `${emails.length} email addresses copied to clipboard.`,
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

  const handleClearFindContacts = () => {
    findContactsForm.reset({ searchCriteria: "" });
    setFindContactsResult(null);
    setError(null);
    toast({
      title: "Cleared",
      description: "Search input and results for 'Find Contacts' have been cleared.",
    });
  };

  const handleClearExtractEmails = () => {
    extractEmailsForm.reset({ textBlock: "" });
    setExtractionResult(null);
    setError(null);
    toast({
      title: "Cleared",
      description: "Text input and results for 'Extract Emails' have been cleared.",
    });
  };

  const handleClearFindResultsOnly = () => {
    setFindContactsResult(null);
    setError(null);
    toast({
      title: "Results Cleared",
      description: "Search results for 'Find Contacts' have been cleared.",
    });
  };

  const handleClearExtractionResultsOnly = () => {
    setExtractionResult(null);
    setError(null);
    toast({
      title: "Results Cleared",
      description: "Extraction results for 'Extract Emails' have been cleared.",
    });
  };
  
  const renderEmailList = (emails: string[]) => {
    return (
      <ul className="space-y-3">
        {emails.map((email, index) => (
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
    );
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8 selection:bg-accent selection:text-accent-foreground">
      <header className="my-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Briefcase className="h-12 w-12 mr-3 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight text-primary">ContactFinder AI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Find B2B contacts by criteria or extract emails from text using AI.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "find" | "extract")} className="w-full max-w-2xl">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="find">
            <Search className="mr-2 h-5 w-5" /> Find Contacts
          </TabsTrigger>
          <TabsTrigger value="extract">
            <FileText className="mr-2 h-5 w-5" /> Extract Emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="find">
          <Card className="w-full shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Find Business Contacts</CardTitle>
              <CardDescription>
                Enter a profession, industry, or work aspect to find relevant email addresses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...findContactsForm}>
                <form onSubmit={findContactsForm.handleSubmit(onSubmitFindContacts)} className="space-y-6">
                  <FormField
                    control={findContactsForm.control}
                    name="searchCriteria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="searchCriteriaInput" className="text-base">Profession, Industry, or Work Aspect</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              id="searchCriteriaInput"
                              placeholder="e.g., 'AI startups', 'plumbers in San Francisco'" 
                              {...field}
                              className="text-base py-3 px-4 pr-10"
                              aria-label="Profession, Industry, or Work Aspect"
                            />
                            {searchCriteriaValue && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => findContactsForm.setValue('searchCriteria', '')}
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
                    {(searchCriteriaValue || findContactsResult || (error && activeTab === "find")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearFindContacts}
                        disabled={isLoading}
                      >
                        <XCircle className="mr-2 h-5 w-5" />
                        Clear
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extract">
          <Card className="w-full shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Extract Email Addresses</CardTitle>
              <CardDescription>
                Paste any text below to extract all email addresses found within it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...extractEmailsForm}>
                <form onSubmit={extractEmailsForm.handleSubmit(onSubmitExtractEmails)} className="space-y-6">
                  <FormField
                    control={extractEmailsForm.control}
                    name="textBlock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="textBlockInput" className="text-base">Text to Extract Emails From</FormLabel>
                        <FormControl>
                           <Textarea
                            id="textBlockInput"
                            placeholder="Paste text containing email addresses here..."
                            {...field}
                            className="text-base min-h-[150px] p-3"
                            aria-label="Text to extract emails from"
                          />
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
                        <FileText className="mr-2 h-5 w-5" />
                      )}
                      Extract Emails
                    </Button>
                     {(textBlockValue || extractionResult || (error && activeTab === "extract")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearExtractEmails}
                        disabled={isLoading}
                      >
                        <XCircle className="mr-2 h-5 w-5" />
                        Clear
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-3" />
          <p className="text-lg">Processing...</p>
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive" className="mt-8 w-full max-w-2xl">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results for Find Contacts */}
      {activeTab === "find" && findContactsResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-grow">
              <CardTitle className="text-2xl">Found Contacts</CardTitle>
              {findContactsResult.reasoning && (
                <CardDescription className="italic text-sm pt-1">
                  {findContactsResult.reasoning}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0 self-start sm:self-center">
              {findContactsResult.emailAddresses.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyAllEmails(findContactsResult.emailAddresses)}
                  aria-label="Copy all found email addresses"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFindResultsOnly}
                aria-label="Clear search results"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Results
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {findContactsResult.emailAddresses.length > 0 ? (
              renderEmailList(findContactsResult.emailAddresses)
            ) : (
              <p className="text-base text-center text-muted-foreground py-4">
                No email addresses found for the provided criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results for Extract Emails */}
      {activeTab === "extract" && extractionResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-grow">
              <CardTitle className="text-2xl">Extraction Result</CardTitle>
              {extractionResult.extractionSummary && (
                <CardDescription className="italic text-sm pt-1">
                  {extractionResult.extractionSummary}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0 self-start sm:self-center">
              {extractionResult.extractedEmails.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyAllEmails(extractionResult.extractedEmails)}
                  aria-label="Copy all extracted email addresses"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearExtractionResultsOnly}
                aria-label="Clear extraction results"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Results
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {extractionResult.extractedEmails.length > 0 ? (
              renderEmailList(extractionResult.extractedEmails)
            ) : (
              <p className="text-base text-center text-muted-foreground py-4">
                No email addresses were found in the provided text.
              </p>
            )}
             {extractionResult.originalTextCharacterCount > 0 && (
                <p className="text-xs text-muted-foreground text-center pt-4">
                    Original text character count: {extractionResult.originalTextCharacterCount}
                </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
