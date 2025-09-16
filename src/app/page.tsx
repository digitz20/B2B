
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Briefcase, Search, Loader2, AlertCircle, Mail, ClipboardCopy, Copy, XCircle, FileText, Wand2, Video, Globe } from "lucide-react";

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
import { extractEmailsFromText, type ExtractEmailsFromTextOutput } from "@/ai/flows/extract-emails-from-text";
import { generateEmailsFromNamesInText, type GenerateEmailsFromNamesInTextOutput } from "@/ai/flows/generate-emails-from-names-in-text";
import { generateEmailsFromDomains, type GenerateEmailsFromDomainsOutput } from "@/ai/flows/generate-emails-from-domains";
import { textToSpeech, type TextToSpeechOutput } from "@/ai/flows/text-to-speech-flow";


const findContactsFormSchema = z.object({
  searchCriteria: z.string().min(3, {
    message: "Search criteria must be at least 3 characters.",
  }),
});
type FindContactsFormValues = z.infer<typeof findContactsFormSchema>;

const extractEmailsFormSchema = z.object({
  textBlockExtract: z.string().min(1, { 
    message: "Please enter some text to extract emails from.",
  }),
});
type ExtractEmailsFormValues = z.infer<typeof extractEmailsFormSchema>;

const generateEmailsFormSchema = z.object({
  textBlockGenerate: z.string().min(10, { 
    message: "Please enter text with names (at least 10 characters).",
  }),
});
type GenerateEmailsFormValues = z.infer<typeof generateEmailsFormSchema>;

const fromDomainsFormSchema = z.object({
  textBlockDomains: z.string().min(1, { 
    message: "Please enter at least one domain.",
  }),
});
type FromDomainsFormValues = z.infer<typeof fromDomainsFormSchema>;

const lipSyncFormSchema = z.object({
    textToSpeak: z.string().min(1, {
        message: "Please enter some text to generate audio from.",
    }),
});
type LipSyncFormValues = z.infer<typeof lipSyncFormSchema>;

type ActiveTab = "find" | "extract" | "generate" | "domains" | "lipsync";

export default function ContactFinderAIPage() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("find");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  const [findContactsResult, setFindContactsResult] = React.useState<FindEmailsByCriteriaOutput | null>(null);
  const [extractionResult, setExtractionResult] = React.useState<ExtractEmailsFromTextOutput | null>(null);
  const [generationResult, setGenerationResult] = React.useState<GenerateEmailsFromNamesInTextOutput | null>(null);
  const [fromDomainsResult, setFromDomainsResult] = React.useState<GenerateEmailsFromDomainsOutput | null>(null);
  const [lipSyncResult, setLipSyncResult] = React.useState<TextToSpeechOutput | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = React.useState<string | null>(null);
  
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
      textBlockExtract: "",
    },
  });

  const generateEmailsForm = useForm<GenerateEmailsFormValues>({
    resolver: zodResolver(generateEmailsFormSchema),
    defaultValues: {
      textBlockGenerate: "",
    },
  });

  const fromDomainsForm = useForm<FromDomainsFormValues>({
    resolver: zodResolver(fromDomainsFormSchema),
    defaultValues: {
      textBlockDomains: "",
    },
  });
  
  const lipSyncForm = useForm<LipSyncFormValues>({
    resolver: zodResolver(lipSyncFormSchema),
    defaultValues: {
        textToSpeak: "",
    },
  });

  const searchCriteriaValue = findContactsForm.watch("searchCriteria");
  const textBlockExtractValue = extractEmailsForm.watch("textBlockExtract");
  const textBlockGenerateValue = generateEmailsForm.watch("textBlockGenerate");
  const textBlockDomainsValue = fromDomainsForm.watch("textBlockDomains");
  const textToSpeakValue = lipSyncForm.watch("textToSpeak");

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
          description: result.reasoning || "We couldn't find any email addresses for the provided criteria.",
        });
      } else {
        toast({
          title: "Contacts Found!",
          description: `Found ${result.emailAddresses.length} email address(es). ${result.reasoning || ''}`,
        });
      }
    } catch (err) {
      console.error("Error finding contacts:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error Finding Contacts",
        description: errorMessage,
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
      const result = await extractEmailsFromText({ textBlock: values.textBlockExtract });
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
        title: "Error Extracting Emails",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitGenerateEmails(values: GenerateEmailsFormValues) {
    setIsLoading(true);
    setError(null);
    setGenerationResult(null);
    try {
      const result = await generateEmailsFromNamesInText({ textBlock: values.textBlockGenerate });
      setGenerationResult(result);
      if (result.guessedEmails.length === 0) {
        toast({
          title: "No Emails Generated",
          description: result.generationSummary || "Could not generate email guesses from the provided text.",
        });
      } else {
        toast({
          title: "Emails Guessed!",
          description: result.generationSummary || `Successfully generated ${result.guessedEmails.length} email address(es).`,
        });
      }
    } catch (err) {
      console.error("Error generating emails:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error Generating Emails",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitFromDomains(values: FromDomainsFormValues) {
    setIsLoading(true);
    setError(null);
    setFromDomainsResult(null);
    try {
      const result = await generateEmailsFromDomains({ textBlock: values.textBlockDomains });
      setFromDomainsResult(result);
      if (result.processedEmails.length === 0) {
        toast({
          title: "No Emails Found",
          description: result.generationSummary || "Could not find any emails for the provided domains.",
        });
      } else {
        toast({
          title: "Emails Found!",
          description: result.generationSummary || `Successfully found ${result.processedEmails.length} email address(es).`,
        });
      }
    } catch (err) {
      console.error("Error generating emails from domains:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error From Domains",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmitLipSync(values: LipSyncFormValues) {
    if (!uploadedVideoUrl) {
        toast({
            variant: "destructive",
            title: "No Video Uploaded",
            description: "Please upload a video file first.",
        });
        return;
    }
    setIsLoading(true);
    setError(null);
    setLipSyncResult(null);
    try {
        const result = await textToSpeech({ textToSpeak: values.textToSpeak });
        setLipSyncResult(result);
        toast({
            title: "Audio Generated!",
            description: result.summary,
        });
    } catch (err) {
        console.error("Error generating audio:", err);
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(errorMessage);
        toast({
            variant: "destructive",
            title: "Error Generating Audio",
            description: errorMessage,
        });
    } finally {
        setIsLoading(false);
    }
  }

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
            variant: "destructive",
            title: "File Too Large",
            description: "Please upload a video file smaller than 5MB.",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedVideoUrl(e.target?.result as string);
        setLipSyncResult(null);
      };
      reader.readAsDataURL(file);
    }
  };


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
  };

  const handleClearExtractEmails = () => {
    extractEmailsForm.reset({ textBlockExtract: "" });
    setExtractionResult(null);
    setError(null);
  };

  const handleClearGenerateEmails = () => {
    generateEmailsForm.reset({ textBlockGenerate: "" });
    setGenerationResult(null);
    setError(null);
  };

  const handleClearFromDomains = () => {
    fromDomainsForm.reset({ textBlockDomains: "" });
    setFromDomainsResult(null);
    setError(null);
  };
  
  const handleClearLipSync = () => {
    lipSyncForm.reset({ textToSpeak: "" });
    setLipSyncResult(null);
    setUploadedVideoUrl(null);
    const fileInput = document.getElementById('videoUploadInput') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    setError(null);
  };

  const handleClearFindResultsOnly = () => {
    setFindContactsResult(null);
    setError(null);
  };

  const handleClearExtractionResultsOnly = () => {
    setExtractionResult(null);
    setError(null);
  };
  
  const handleClearGenerationResultsOnly = () => {
    setGenerationResult(null);
    setError(null);
  };

  const handleClearFromDomainsResultsOnly = () => {
    setFromDomainsResult(null);
    setError(null);
  };
  
  const handleClearLipSyncResultsOnly = () => {
    setLipSyncResult(null);
    setError(null);
  };
  
  const renderEmailList = (emails: string[], listType: "found" | "extracted" | "generated" | "domains") => {
    return (
      <ul className="space-y-3">
        {emails.map((email, index) => (
          <li key={`${listType}-${index}`} className="flex items-center justify-between p-3 bg-secondary/50 rounded-md">
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
          AI-powered tools for B2B contacts, email extraction, and generative AI features.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ActiveTab)} className="w-full max-w-2xl">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="find">
            <Search className="mr-2 h-5 w-5" /> Find
          </TabsTrigger>
          <TabsTrigger value="extract">
            <FileText className="mr-2 h-5 w-5" /> Extract
          </TabsTrigger>
          <TabsTrigger value="generate">
            <Wand2 className="mr-2 h-5 w-5" /> Guess
          </TabsTrigger>
          <TabsTrigger value="domains">
            <Globe className="mr-2 h-5 w-5" /> From Domains
          </TabsTrigger>
          <TabsTrigger value="lipsync">
            <Video className="mr-2 h-5 w-5" /> Lip Sync
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
                      {isLoading && activeTab === "find" ? (
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
                        disabled={isLoading && activeTab === "find"}
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
                    name="textBlockExtract"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="textBlockExtractInput" className="text-base">Text to Extract Emails From</FormLabel>
                        <FormControl>
                           <Textarea
                            id="textBlockExtractInput"
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
                      {isLoading && activeTab === "extract" ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-5 w-5" />
                      )}
                      Extract Emails
                    </Button>
                     {(textBlockExtractValue || extractionResult || (error && activeTab === "extract")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearExtractEmails}
                        disabled={isLoading && activeTab === "extract"}
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
        </TabsContent>
        
        <TabsContent value="generate">
          <Card className="w-full shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Generate Guessed Emails</CardTitle>
              <CardDescription>
                Paste text with names to generate potential email address guesses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...generateEmailsForm}>
                <form onSubmit={generateEmailsForm.handleSubmit(onSubmitGenerateEmails)} className="space-y-6">
                  <FormField
                    control={generateEmailsForm.control}
                    name="textBlockGenerate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="textBlockGenerateInput" className="text-base">Text with Names</FormLabel>
                        <FormControl>
                           <Textarea
                            id="textBlockGenerateInput"
                            placeholder="Paste text containing names of people..."
                            {...field}
                            className="text-base min-h-[150px] p-3"
                            aria-label="Text with names to generate email guesses from"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
                      {isLoading && activeTab === "generate" ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-5 w-5" />
                      )}
                      Generate Guesses
                    </Button>
                     {(textBlockGenerateValue || generationResult || (error && activeTab === "generate")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearGenerateEmails}
                        disabled={isLoading && activeTab === "generate"}
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
        </TabsContent>
        
        <TabsContent value="domains">
          <Card className="w-full shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Generate Emails from Domains</CardTitle>
              <CardDescription>
                Paste a list of company domains to find potential email addresses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...fromDomainsForm}>
                <form onSubmit={fromDomainsForm.handleSubmit(onSubmitFromDomains)} className="space-y-6">
                  <FormField
                    control={fromDomainsForm.control}
                    name="textBlockDomains"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="textBlockDomainsInput" className="text-base">Company Domains</FormLabel>
                        <FormControl>
                           <Textarea
                            id="textBlockDomainsInput"
                            placeholder="example.com&#10;uber.com&#10;google.com"
                            {...field}
                            className="text-base min-h-[150px] p-3"
                            aria-label="List of company domains"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="submit" className="w-full text-base py-3" disabled={isLoading}>
                      {isLoading && activeTab === "domains" ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Globe className="mr-2 h-5 w-5" />
                      )}
                      Find Emails
                    </Button>
                     {(textBlockDomainsValue || fromDomainsResult || (error && activeTab === "domains")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearFromDomains}
                        disabled={isLoading && activeTab === "domains"}
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
        </TabsContent>

        <TabsContent value="lipsync">
          <Card className="w-full shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Lip Sync (Prototype)</CardTitle>
              <CardDescription>
                Upload a video, provide text, and the AI will generate speech audio. 
                Full video lip-syncing is not yet supported.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...lipSyncForm}>
                <form onSubmit={lipSyncForm.handleSubmit(onSubmitLipSync)} className="space-y-6">
                   <FormItem>
                        <FormLabel htmlFor="videoUploadInput" className="text-base">1. Upload Video (Max 5MB)</FormLabel>
                        <FormControl>
                            <Input 
                                id="videoUploadInput"
                                type="file"
                                accept="video/*"
                                onChange={handleVideoUpload}
                                className="text-base file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                                aria-label="Upload video file"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>

                  <FormField
                    control={lipSyncForm.control}
                    name="textToSpeak"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="textToSpeakInput" className="text-base">2. Text to Generate</FormLabel>
                        <FormControl>
                           <Textarea
                            id="textToSpeakInput"
                            placeholder="Enter the text you want the AI to speak..."
                            {...field}
                            className="text-base min-h-[100px] p-3"
                            aria-label="Text to generate audio from"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button type="submit" className="w-full text-base py-3" disabled={isLoading || !uploadedVideoUrl}>
                      {isLoading && activeTab === "lipsync" ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Video className="mr-2 h-5 w-5" />
                      )}
                      Generate Audio
                    </Button>
                     {(uploadedVideoUrl || textToSpeakValue || lipSyncResult || (error && activeTab === "lipsync")) && (
                       <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full sm:w-auto text-base py-3" 
                        onClick={handleClearLipSync}
                        disabled={isLoading && activeTab === "lipsync"}
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
        </TabsContent>
      </Tabs>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-3" />
          <p className="text-lg">AI is thinking...</p>
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
              renderEmailList(findContactsResult.emailAddresses, "found")
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
              renderEmailList(extractionResult.extractedEmails, "extracted")
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

      {/* Results for Generate Guessed Emails */}
      {activeTab === "generate" && generationResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-grow">
              <CardTitle className="text-2xl">Guessed Emails</CardTitle>
              {generationResult.generationSummary && (
                <CardDescription className="italic text-sm pt-1">
                  {generationResult.generationSummary}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0 self-start sm:self-center">
              {generationResult.guessedEmails.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyAllEmails(generationResult.guessedEmails)}
                  aria-label="Copy all guessed email addresses"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearGenerationResultsOnly}
                aria-label="Clear guessed email results"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Results
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {generationResult.guessedEmails.length > 0 ? (
              renderEmailList(generationResult.guessedEmails, "generated")
            ) : (
              <p className="text-base text-center text-muted-foreground py-4">
                No email addresses could be guessed from the provided text.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Results for From Domains */}
      {activeTab === "domains" && fromDomainsResult && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-grow">
              <CardTitle className="text-2xl">Found Emails</CardTitle>
              {fromDomainsResult.generationSummary && (
                <CardDescription className="italic text-sm pt-1">
                  {fromDomainsResult.generationSummary}
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0 self-start sm:self-center">
              {fromDomainsResult.processedEmails.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyAllEmails(fromDomainsResult.processedEmails)}
                  aria-label="Copy all found email addresses"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFromDomainsResultsOnly}
                aria-label="Clear results"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Results
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fromDomainsResult.processedEmails.length > 0 ? (
              renderEmailList(fromDomainsResult.processedEmails, "domains")
            ) : (
              <p className="text-base text-center text-muted-foreground py-4">
                No emails could be found for the provided domains.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results for Lip Sync */}
      {activeTab === "lipsync" && (uploadedVideoUrl || lipSyncResult) && !isLoading && !error && (
        <Card className="mt-8 w-full max-w-2xl shadow-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex-grow">
              <CardTitle className="text-2xl">Lip Sync Result</CardTitle>
              <CardDescription className="italic text-sm pt-1">
                Here is your uploaded video and the generated audio.
              </CardDescription>
            </div>
             <Button
                variant="outline"
                size="sm"
                onClick={handleClearLipSyncResultsOnly}
                aria-label="Clear lip sync results"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Result
              </Button>
          </CardHeader>
          <CardContent>
            {uploadedVideoUrl && (
                <div>
                    <h3 className="text-lg font-medium mb-2">Uploaded Video</h3>
                    <video key={uploadedVideoUrl} controls src={uploadedVideoUrl} className="w-full rounded-md aspect-video bg-black"></video>
                </div>
            )}
            {lipSyncResult?.audioDataUri && (
                <div className="mt-6">
                    <h3 className="text-lg font-medium mb-2">Generated Audio</h3>
                    <audio controls src={lipSyncResult.audioDataUri} className="w-full"></audio>
                    <p className="text-xs text-muted-foreground text-center pt-4">
                        {lipSyncResult.summary}
                    </p>
                </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
