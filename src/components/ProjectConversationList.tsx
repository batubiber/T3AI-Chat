import { MessageSquare, Trash2, Plus, GitBranch, ArrowUpRight, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { type Project } from "@/contexts/ProjectContext";
import { useChat } from "@/contexts/ChatContext";
import { cn, truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { ConversationTree } from "./ConversationTree";

interface ProjectConversationListProps {
  project: Project;
  onSelect?: () => void;
}

export function ProjectConversationList({ project, onSelect }: ProjectConversationListProps) {
  const { 
    conversations, 
    activeConversationId, 
    switchConversation, 
    goToNewChatScreen,
    deleteConversation,
    toggleFavorite
  } = useChat();

  const selectConversation = (id: string) => {
    switchConversation(id);
    onSelect?.();
  };
  const newConversation = () => {
    goToNewChatScreen();
    onSelect?.();
  };

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    await deleteConversation(conversationId);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    await toggleFavorite(conversationId);
  };

  const favoriteConversations = conversations.filter(c => c.isFavorite);
  const regularConversations = conversations.filter(c => !c.isFavorite);

  return (
    <div className="sidebar-motion flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={newConversation}
        >
          <Plus className="h-4 w-4 mr-2" />
          Yeni Sohbet
        </Button>
        <ConversationTree
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={selectConversation}
        />
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Henüz sohbet yok</p>
            </div>
          ) : (
            <>
              {/* Favorites Section */}
              {favoriteConversations.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5 px-2">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span className="text-xs text-muted-foreground">Favoriler</span>
                  </div>
                  {favoriteConversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={cn(
                        "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors min-w-0 overflow-hidden",
                        activeConversationId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                        <Star className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          {conv.isGeneratingTitle ? (
                            <span className="inline-block w-24 h-4 bg-muted-foreground/20 rounded animate-pulse" />
                          ) : (
                            <p className="text-sm font-medium truncate w-full" title={conv.title}>{truncateByChars(conv.title, TRUNCATE_LIMITS.CONVERSATION_TITLE)}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.createdAt), {
                              addSuffix: true,
                              locale: tr,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-amber-500 hover:text-amber-600"
                          onClick={(e) => handleToggleFavorite(e, conv.id)}
                        >
                          <Star className="h-4 w-4 fill-amber-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDelete(e, conv.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Regular Conversations */}
              {regularConversations.length > 0 && (
                <>
                  {favoriteConversations.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-1.5 px-2">
                      <span className="text-xs text-muted-foreground">Sohbetler</span>
                    </div>
                  )}
                  {regularConversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={cn(
                        "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors min-w-0 overflow-hidden",
                        activeConversationId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {conv.isGeneratingTitle ? (
                              <span className="inline-block w-24 h-4 bg-muted-foreground/20 rounded animate-pulse" />
                            ) : (
                              <p className="text-sm font-medium truncate flex-1 min-w-0" title={conv.title}>{truncateByChars(conv.title, TRUNCATE_LIMITS.CONVERSATION_TITLE)}</p>
                            )}
                            {conv.forkedFromConversationId && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <GitBranch className="h-3 w-3 text-amber-500" />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (conv.forkedFromConversationId) {
                                            switchConversation(conv.forkedFromConversationId);
                                          }
                                        }}
                                        className="p-0.5 rounded hover:bg-primary/20 transition-colors"
                                      >
                                        <ArrowUpRight className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                      </button>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Orijinal sohbete git</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.createdAt), {
                              addSuffix: true,
                              locale: tr,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                          onClick={(e) => handleToggleFavorite(e, conv.id)}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => handleDelete(e, conv.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
