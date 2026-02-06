'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Search, X, FileCode, Component, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTopologyStore } from '@/stores/topologyStore';
import type { NodeType, DiffStatus, Language, TopologyNode } from '@/types/topology';

const TYPE_CONFIG: Record<NodeType, { icon: typeof FileCode; label: string; color: string }> = {
  FILE: { icon: FileCode, label: 'File', color: 'bg-slate-100 text-slate-700 hover:bg-slate-200' },
  COMPONENT: { icon: Component, label: 'Component', color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  UTILITY: { icon: Wrench, label: 'Utility', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
};

const STATUS_CONFIG: Record<DiffStatus, { label: string; color: string }> = {
  UNCHANGED: { label: 'Unchanged', color: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
  ADDED: { label: 'Added', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  MODIFIED: { label: 'Modified', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  DELETED: { label: 'Deleted', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
};

const LANGUAGE_CONFIG: Record<Language, { label: string; color: string }> = {
  typescript: { label: 'TypeScript', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  javascript: { label: 'JavaScript', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  python: { label: 'Python', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
};

export function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    searchQuery,
    typeFilters,
    statusFilters,
    languageFilters,
    selectedNodeId,
    isSearchFocused,
    setSearchQuery,
    toggleTypeFilter,
    toggleStatusFilter,
    toggleLanguageFilter,
    selectNode,
    clearSearch,
    setSearchFocused,
    getSearchResults,
  } = useTopologyStore();

  const searchResults = getSearchResults();
  const hasFilters = searchQuery || typeFilters.size > 0 || statusFilters.size > 0 || languageFilters.size > 0;

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // "/" to focus search
      if (e.key === '/' && !isSearchFocused) {
        e.preventDefault();
        inputRef.current?.focus();
      }

      // Escape to clear/unfocus
      if (e.key === 'Escape') {
        if (isSearchFocused) {
          inputRef.current?.blur();
        } else if (hasFilters || selectedNodeId) {
          clearSearch();
        }
      }
    },
    [isSearchFocused, hasFilters, selectedNodeId, clearSearch]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleResultClick = (node: TopologyNode) => {
    selectNode(node.id);
    inputRef.current?.blur();
  };

  const handleResultKeyDown = (e: React.KeyboardEvent, node: TopologyNode, index: number) => {
    if (e.key === 'Enter') {
      handleResultClick(node);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = document.querySelector(`[data-result-index="${index + 1}"]`) as HTMLElement;
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        const prev = document.querySelector(`[data-result-index="${index - 1}"]`) as HTMLElement;
        prev?.focus();
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && searchResults.length > 0) {
      e.preventDefault();
      const first = document.querySelector('[data-result-index="0"]') as HTMLElement;
      first?.focus();
    }
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search nodes... (press /)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          onKeyDown={handleInputKeyDown}
          className="pl-9 pr-8 h-9 w-64 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 focus:bg-white dark:focus:bg-slate-600"
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={clearSearch}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Dropdown Panel */}
      {isSearchFocused && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
          {/* Type Filters */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Filter by Type</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_CONFIG) as NodeType[]).map((type) => {
                const config = TYPE_CONFIG[type];
                const Icon = config.icon;
                const isActive = typeFilters.has(type);
                return (
                  <Badge
                    key={type}
                    variant="outline"
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? config.color.replace('hover:', '')
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    onClick={() => toggleTypeFilter(type)}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Status Filters */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Filter by Status</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_CONFIG) as DiffStatus[]).map((status) => {
                const config = STATUS_CONFIG[status];
                const isActive = statusFilters.has(status);
                return (
                  <Badge
                    key={status}
                    variant="outline"
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? config.color.replace('hover:', '')
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    onClick={() => toggleStatusFilter(status)}
                  >
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Language Filters */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Filter by Language</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LANGUAGE_CONFIG) as Language[]).map((language) => {
                const config = LANGUAGE_CONFIG[language];
                const isActive = languageFilters.has(language);
                return (
                  <Badge
                    key={language}
                    variant="outline"
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? config.color.replace('hover:', '')
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                    onClick={() => toggleLanguageFilter(language)}
                  >
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Search Results */}
          <ScrollArea className="max-h-64">
            <div className="p-2">
              {searchResults.length === 0 ? (
                <div className="text-center py-4 text-sm text-slate-400 dark:text-slate-500">
                  {hasFilters ? 'No matching nodes' : 'Type to search...'}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {searchResults.slice(0, 20).map((node, index) => {
                    const typeConfig = TYPE_CONFIG[node.type];
                    const statusConfig = STATUS_CONFIG[node.status];
                    const Icon = typeConfig.icon;
                    const isSelected = selectedNodeId === node.id;

                    return (
                      <button
                        key={node.id}
                        data-result-index={index}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-slate-700'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                        onClick={() => handleResultClick(node)}
                        onKeyDown={(e) => handleResultKeyDown(e, node, index)}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${typeConfig.color.split(' ')[1]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                            {node.label}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{node.id}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {node.language && (
                            <span
                              className={`text-[10px] font-semibold px-1 py-0.5 rounded text-white ${
                                node.language === 'typescript' ? 'bg-blue-500' :
                                node.language === 'javascript' ? 'bg-yellow-500' :
                                'bg-green-600'
                              }`}
                            >
                              {node.language === 'typescript' ? 'TS' :
                               node.language === 'javascript' ? 'JS' : 'PY'}
                            </span>
                          )}
                          {node.status !== 'UNCHANGED' && (
                            <Badge
                              variant="outline"
                              className={`text-xs px-1.5 py-0 ${statusConfig.color}`}
                            >
                              {node.status.toLowerCase()}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {searchResults.length > 20 && (
                    <div className="text-center py-2 text-xs text-slate-400 dark:text-slate-500">
                      +{searchResults.length - 20} more results
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Keyboard Hints */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500 flex gap-4">
            <span><kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Tab</kbd> navigate</span>
            <span><kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Enter</kbd> select</span>
            <span><kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
