import MicStream from "../components/speech/MicStream";

import Layout from "../Layout";
// import { useOsdkClient } from "@osdk/react";

function Home() {
  // const client = useOsdkClient();
  // See API Docs on Developer console on how to use the client object to access the ontology resource

  
  return (
    <Layout>
      <div className="grid grid-cols-2 grid-rows-1 h-full" style={{ height: 'calc(100vh - 60px)' }}>
        <div className="flex flex-col items-center justify-center border-r-[1px] border-gray-300 h-full">
          <MicStream />
        </div>
        <div className="flex flex-col items-center justify-center border-r-[1px] border-gray-300 h-full">
          
        </div>
      </div>
    </Layout>
  );
}

export default Home;
