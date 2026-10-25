import React from 'react';

export const ARCHON_ASCII_ART = `                      @%*+-::..::+@                          
                  %-++:.....-.....=%=-=+#@@@@@               
                %-....:--=*=*=.:-.=.:::::*-..+#@             
             @%%........-:+=.::...=-++*-:...::::#@           
            %-.-....:==#.:%..+.:-:.:::+@:..=@#==*@           
           %.=...#..=-=..:%-..::-*#+*%@@=-+%%..::+@          
          @=-:.=:=...##:.:-%+-:-*@@@@@%#*=:-:.:+%-#          
          @*+::::-:...*%+===%@@@@@@%*-.:-=----+%%*+@@        
         @@=-=-.-%#-::...-%@@@@*-.:.....::#@@@#+%*=@@        
        %---.....:@%++*#%%=..............--*@@@@@%#@@        
       @-...::...-.::*%#:...:::-===:......::+@@@@@@@@        
       @:.:%%##=::-+%@+::::-=**#%@@@%+..::--*@@@@@@@         
       @+-:#*%###%%@@+....=*=---+@@@@#:.:%@@@@@@@@@          
        @+*%=%@@#==+#..:......:::##+:...:@@@@@@@@            
         @##-:*@%*#%+...::..............:@@@@@@@             
         @=-*..=%=::.....:..............:@@@@                
         @#=%=...........::::...........-@@@@                
          +..+%+=+..........::..........-@@@@                
          @--=+#@%...........::....+%%#+#@@@                 
           @*.=%*.:.........::::=-=+=%@@@@@@                 
            %*#%:..+::.....:::::.:::=@@@@@@                  
             *=+=...#=-::..:::...:=#@@@@@@                   
              %#*:...+%+-:::::......-%@@@                    
                @::...:%@%=-:-:....::%@@                     
                @-::....+@@@@%+---=#@@@@@                    
                 *::......%@@@@@@@@@@@@@@@                   
                 %:::......=@@@@@@@@@@@@@@@@                 
                 @-::.......:%@@@@@@@@@@@@@@@@@@             
                 @=:::.......-*%@@@@@@@@@@@@@@@              
                  #:::.....:::-+*%@@@@@@@@@@@                
                  @#-::......::-=++#%@@@@@@@                 
                    @*=-......::::=+++*#@                    
                       @*-:...:==+**#@                       `;

/* -- Syntax Highlighting Engine (Token-level) ---------------- */
export function highlightCodeLine(line: string) {
  if (!line) return <span>&nbsp;</span>;
  
  const tokens: React.ReactNode[] = [];
  const regex = /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:def|function|const|let|var|class|import|from|export|return|if|else|elif|for|while|try|except|catch|finally|async|await|type|interface|extends|implements|new|this|self|null|undefined|true|false|None|True|False)\b|\b(?:print|console|log|require|fetch|len|range|str|int|dict|list|set|open|useState|useEffect|useRef)\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()|\b\d+\.?\d*\b|[{}()\[\].,;+\-*\/=<>!&|?:%])/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(<span key={lastIndex} className="text-fg-soft">{line.substring(lastIndex, match.index)}</span>);
    }

    const token = match[0];
    if (token.startsWith('//') || token.startsWith('#')) {
      tokens.push(<span key={match.index} className="text-fg-subtle italic">{token}</span>);
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      tokens.push(<span key={match.index} className="text-[#9ece6a]">{token}</span>);
    } else if (/^\b(?:def|function|const|let|var|class|import|from|export|return|if|else|elif|for|while|try|except|catch|finally|async|await|type|interface|extends|implements|new)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#bb9af7] font-semibold">{token}</span>);
    } else if (/^\b(?:this|self|null|undefined|true|false|None|True|False)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#ff9e64]">{token}</span>);
    } else if (/^\b(?:print|console|log|require|fetch|len|range|str|int|dict|list|set|open|useState|useEffect|useRef)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#7dcfff]">{token}</span>);
    } else if (/^\d+\.?\d*$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#ff9e64]">{token}</span>);
    } else if (/^[{}()\[\].,;+\-*\/=<>!&|?:%]$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#89ddff]">{token}</span>);
    } else {
      tokens.push(<span key={match.index} className="text-[#7aa2f7]">{token}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push(<span key={lastIndex} className="text-fg-soft">{line.substring(lastIndex)}</span>);
  }

  return tokens;
}
