import { useState, useMemo } from "react";
import { GitBranch, ChevronRight, ChevronDown, MessageSquare, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, truncateByChars, TRUNCATE_LIMITS } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface ConversationNode {
  id: string;
  title: string;
  createdAt: Date;
  forkedFromConversationId?: string;
  forkedAtMessageId?: string;
  children: ConversationNode[];
  depth: number;
  isGeneratingTitle?: boolean;
}

interface ConversationTreeProps {
  conversations: Array<{
    id: string;
    title: string;
    createdAt: Date;
    forkedFromConversationId?: string;
    forkedAtMessageId?: string;
    isGeneratingTitle?: boolean;
  }>;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

function buildTree(conversations: ConversationTreeProps["conversations"]): ConversationNode[] {
  const nodeMap = new Map<string, ConversationNode>();
  const roots: ConversationNode[] = [];

  // Create nodes for all conversations
  conversations.forEach((conv) => {
    nodeMap.set(conv.id, {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      forkedFromConversationId: (conv as any).forkedFromConversationId,
      forkedAtMessageId: (conv as any).forkedAtMessageId,
      children: [],
      depth: 0,
      isGeneratingTitle: conv.isGeneratingTitle,
    });
  });

  // Build tree structure and calculate depth
  const calculateDepth = (node: ConversationNode, depth: number) => {
    node.depth = depth;
    node.children.forEach((child) => calculateDepth(child, depth + 1));
  };

  conversations.forEach((conv) => {
    const node = nodeMap.get(conv.id)!;
    const parentId = (conv as any).forkedFromConversationId;

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Calculate depths
  roots.forEach((root) => calculateDepth(root, 0));

  // Sort by date (newest first)
  const sortByDate = (a: ConversationNode, b: ConversationNode) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  roots.sort(sortByDate);
  nodeMap.forEach((node) => node.children.sort(sortByDate));

  return roots;
}

function getParentTitle(parentId: string | undefined, conversations: ConversationTreeProps["conversations"]): string | null {
  if (!parentId) return null;
  const parent = conversations.find((c) => c.id === parentId);
  return parent?.title || null;
}

interface TreeNodeProps {
  node: ConversationNode;
  level: number;
  activeId: string | null;
  onSelect: (id: string) => void;
  isLast: boolean;
  parentLines: boolean[];
  allConversations: ConversationTreeProps["conversations"];
}

function TreeNode({ node, level, activeId, onSelect, isLast, parentLines, allConversations }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeId;
  const isFork = !!node.forkedFromConversationId;
  const parentTitle = getParentTitle(node.forkedFromConversationId, allConversations);

  const formattedDate = format(new Date(node.createdAt), "d MMM yyyy, HH:mm", { locale: tr });

  // Count total descendants
  const countDescendants = (n: ConversationNode): number => {
    return n.children.reduce((acc, child) => acc + 1 + countDescendants(child), 0);
  };
  const totalDescendants = countDescendants(node);

  return (
    <div className="select-none">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex items-center gap-1 py-2 px-2 rounded-[10px] cursor-pointer transition-all duration-200 group/node relative min-w-0 overflow-hidden",
                isActive
                  ? "bg-primary/15 dark:bg-[#423030] text-primary dark:text-white ring-1 ring-primary/30 dark:ring-0 dark:border dark:border-[#C41718]"
                  : "hover:bg-muted/50 dark:hover:bg-[#4a4a4a] text-foreground dark:bg-[#3D3D3D]"
              )}
              onClick={() => onSelect(node.id)}
            >
              {/* Tree connection lines */}
              <div className="flex items-center shrink-0" style={{ width: level * 20 }}>
                {parentLines.map((showLine, i) => (
                  <div
                    key={i}
                    className="w-5 h-full flex justify-center relative"
                  >
                    {showLine && (
                      <div className="absolute top-0 bottom-0 w-px bg-border/60" style={{ left: '50%' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Horizontal connector for non-root nodes */}
              {level > 0 && (
                <div className="absolute flex items-center" style={{ left: (level - 1) * 20 + 8, top: 0, bottom: '50%' }}>
                  <div className={cn(
                    "w-3 border-l border-b border-border/60 rounded-bl-md",
                    isLast ? "h-full" : "h-full"
                  )} style={{ height: 'calc(50% + 8px)', marginTop: '-8px' }} />
                </div>
              )}

              {/* Expand/Collapse button or node indicator */}
              {hasChildren ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0 hover:bg-primary/10 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              ) : (
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    isActive ? "bg-primary dark:bg-[#C41718]" : "bg-muted-foreground/40 dark:bg-[#666666]"
                  )} />
                </div>
              )}

              {/* Icon with depth indicator */}
              <div className="relative shrink-0">
                {isFork ? (
                  <GitBranch className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-primary" : "text-amber-500/80 group-hover/node:text-amber-500"
                  )} />
                ) : (
                  <MessageSquare className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} />
                )}
                {node.depth > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-medium bg-muted text-muted-foreground rounded-full w-3 h-3 flex items-center justify-center">
                    {node.depth}
                  </span>
                )}
              </div>

              {/* Title */}
              {node.isGeneratingTitle ? (
                <span className="inline-block w-24 h-3.5 bg-muted-foreground/20 rounded animate-pulse ml-1" />
              ) : (
              <span className="text-sm truncate flex-1 min-w-0 ml-1" title={node.title}>
                {truncateByChars(node.title, TRUNCATE_LIMITS.CONVERSATION_TITLE)}
              </span>
              )}

              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {totalDescendants > 0 && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <GitBranch className="h-2.5 w-2.5" />
                    {totalDescendants}
                  </span>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs break-all">
            <div className="space-y-2">
              <p className="font-medium whitespace-normal break-all">{node.title}</p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formattedDate}</span>
              </div>
              {isFork && parentTitle && (
                <div className="flex items-start gap-1.5 text-xs">
                  <GitBranch className="h-3 w-3 text-amber-500 mt-0.5" />
                  <span>
                    <span className="text-muted-foreground">Dallandırıldı: </span>
                    <span className="font-medium text-foreground">{parentTitle}</span>
                  </span>
                </div>
              )}
              {totalDescendants > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>{totalDescendants} alt dal</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Derinlik: {node.depth}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Vertical connection line for children */}
          <div
            className="absolute top-0 w-px bg-gradient-to-b from-border/60 to-transparent"
            style={{ 
              left: level * 20 + 18,
              height: 'calc(100% - 16px)'
            }}
          />
          {node.children.map((child, index) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              activeId={activeId}
              onSelect={onSelect}
              isLast={index === node.children.length - 1}
              parentLines={[...parentLines, !isLast]}
              allConversations={allConversations}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConversationTree({
  conversations,
  activeConversationId,
  onSelectConversation,
}: ConversationTreeProps) {
  const [open, setOpen] = useState(false);

  const tree = useMemo(() => buildTree(conversations), [conversations]);

  const stats = useMemo(() => {
    const forked = conversations.filter((c) => (c as any).forkedFromConversationId).length;
    const roots = conversations.length - forked;
    
    // Calculate max depth
    const getMaxDepth = (nodes: ConversationNode[]): number => {
      if (nodes.length === 0) return 0;
      return Math.max(...nodes.map((n) => 
        n.children.length > 0 ? 1 + getMaxDepth(n.children) : 0
      ));
    };
    const maxDepth = getMaxDepth(tree);
    
    return { total: conversations.length, roots, forked, maxDepth };
  }, [conversations, tree]);

  const handleSelect = (id: string) => {
    onSelectConversation(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-[10px] bg-[#FAFAFA] border border-[#E6E6E6] dark:bg-sidebar-accent dark:border-transparent hover:bg-muted text-[#333333] dark:text-foreground"
          title="Sohbet Ağacı"
        >
          <GitBranch className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] dark:bg-[#2C2C2C] dark:border-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary dark:text-[#C41718]" />
            Sohbet Ağacı
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1 p-3 rounded-[10px] bg-muted/30 dark:bg-[#3D3D3D]">
            <div className="text-2xl font-medium text-foreground dark:text-white">{stats.total}</div>
            <div className="text-sm text-muted-foreground dark:text-[#CCCCCC]">Toplam</div>
          </div>
          <div className="space-y-1 p-3 rounded-[10px] bg-muted/30 dark:bg-[#3D3D3D]">
            <div className="text-2xl font-medium text-foreground dark:text-white">{stats.roots}</div>
            <div className="text-sm text-muted-foreground dark:text-[#CCCCCC]">Ana Sohbet</div>
          </div>
          <div className="space-y-1 p-3 rounded-[10px] bg-muted/30 dark:bg-[#3D3D3D]">
            <div className="text-2xl font-medium text-[#FFA500]">{stats.forked}</div>
            <div className="text-sm text-muted-foreground dark:text-[#CCCCCC]">Dallanmış</div>
          </div>
          <div className="space-y-1 p-3 rounded-[10px] bg-muted/30 dark:bg-[#3D3D3D]">
            <div className="text-2xl font-medium text-foreground dark:text-white">{stats.maxDepth}</div>
            <div className="text-sm text-muted-foreground dark:text-[#CCCCCC]">Derinlik</div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground dark:text-white px-1">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Ana Sohbet</span>
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-amber-500 dark:text-[#FFA500]" />
            <span>Dallanmış</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary dark:bg-[#C41718]" />
            <span>Aktif</span>
          </div>
        </div>

        {/* Tree */}
        <ScrollArea className="h-[400px] pr-4">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Henüz sohbet yok</p>
              <p className="text-xs mt-1 opacity-70">Yeni bir sohbet başlatın</p>
            </div>
          ) : (
            <div className="space-y-0.5 py-1">
              {tree.map((node, index) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  activeId={activeConversationId}
                  onSelect={handleSelect}
                  isLast={index === tree.length - 1}
                  parentLines={[]}
                  allConversations={conversations}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
