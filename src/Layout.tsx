import { Icon, Tag } from "@blueprintjs/core";
import React from "react";
import './index.css'

interface LayoutProps {
  children?: React.ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className="flex h-[60px] w-full border-b-[1px] border-gray-300 p-0 items-center">
        <div className="h-full aspect-square bg-sky-100  flex items-center justify-center">
          <Icon icon="phone-call" size={25}  className="!text-sky-700"/>
        </div>
        <p className="text-xl ml-4 font-semibold  font-sans"
        >Voice Agents</p>
        <Tag className="ml-4 bg-gray-200 text-gray-700 text-sm" >
          Beta
        </Tag>
      </div>
      {children} 
    </>
  );
}

export default Layout;
