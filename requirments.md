Slack integration  
I’d like to create a slack integration to handle many of the duties performed by ward members. I would like the integration to be architected such that I could give it to any other bishopric and they would be able to set it up for their ward given they have somewhere to host it. Each ward has access to a windows machine that is always on, so self hosting may be an option. Other decisions are to use sqlite as a db and create some sort of periodic backup to google drive.I would like there to be an AI agent that uses [z.ai](http://z.ai) glm 4.7 flash model for the agent. This should be done in python to make use of langchain-zhipuai python package. For interfacing with slack we should use slack bolt in python.  
Users should be able to directly message the agent to interact with it or tag it in channels. The agent will be named ALMA or Automated leadership management assistant. Because we are using a smaller model take into consideration that we should use subagents that our main agent can use to complete tasks. A limitation of [z.ai](http://z.ai)’s free tier is that it only allows one concurrent request at a time. When possible we should program processes instead of relying on the agent to follow them. The majority of the use cases for the agent will be to ask it to do things the user could do with commands but the user doesn’t know the commands, and for the meeting agenda process.  
Roles

* Bishop  
* Bishopric Counselor  
* Executive secretary  
* Clerk  
* Organization leader (Relief society, Elders Quorum, Young Women, sunday School, ability to add more organizations if needed) for v1 will not be slack users. The bot should interact with them via email (smtp/imap) any automated email should inform the user that it is an automated email from ALMA

The processes that I would like to streamline

* Organizing interviews  
  * Allow me to keep a list of people who need to be scheduled and if they have been contacted, if they have been scheduled for said interview  
  * Easily add people to a list of people to interview  
  * Remind me weekly of who needs an interview that I haven't heard from  
  * Allow me to schedule interviews  
    * Requires a connection to some sort of calendar \- we can do an internal solution or connect to google calendar \- only if there is capability to use google calendars new booking feature  
  * After interviews scheduled time passes ask the person (bishop or counselor) if the interview happened and if that person needs to be scheduled for a follow up (optional add to upcoming ward council agenda maybe)  
  * Behavior for interviews is  
    * Using a slack command or via agent, i add people to the list of people to interview  
    * Bot proposes times for interviews, sending texts and emails is automated via links clickable in slack such as sms:+15551234567?body=Hello or mailto links with the recipient, subject and body. When a link is sent ask me if i sent the message to register it in the backend  
    * Using a slack command or via agent, i report when the person said they would be at the interview, then the interview is added to the google calendar  
    * The applicable interviewer and interviewee are notified by being added as attendees to the google calendar event.  
    * After the interview passes, the applicable interviewer is sent a message to ask if the interviewee attended the meeting (y/n) if they did, if a follow up is needed. The executive secretary is notified if they need rescheduled or a follow up scheduled and they added back into the list of people that need interviewed (in the database)  
* Meeting notes  
  * Meetings are ward council, bishopric meeting, youth council  
  * Allow me to take notes during a meeting  
  * From the notes, update the original agenda with what we talked about  
  * Create a new agenda, organizing the items to ask the bishop if we should talk abou them next agenda.  
  * One day before the meeting, send a message to each org leader to ask if there are any people they would like to add for ministering items or other topics they would like to discuss in ward council.  
  * From the responses, create the new agenda  
  * Currently we are using google docs for this, but i would be open to using a canvas in each meetings channel if there is a way to archive the agendas after the meeting is done, while not having to pay for the pro features of slack.  
  * During meeting notes I will create todo items, the majority of todo items will come from meeting notes  
  * Meeting notes and agendas behavior is  
    * Meeting notes are started via a slack command or via the agent  
    * I will enter notes into the chat with the agent.  
    * At the end the notes are organized into what agenda section they should pertain to, so that they can be used to create an agenda for the next meeting.  
    * Todo items are created via slack command or the agent makes them, they should have an assignee, the task, and an end date. See todo items section for more on todo items  
    * After the meeting a list of agenda items is made from the notes of the meeting and the items from the last agenda. The bishop is sent a list of each item with a checkbox, to determine if items should be included in the next agenda.  
    * Once the agent knows what to include in the next agenda it creates it and sends it to the bishopric for review, the bishopric can provide feedback to refine the agenda until it gets approved  
    * Two days before the next meeting the bot sends an email to ask the organization members (bishopric members asked via message) if they have anything to add to the program and it adds their responses to the agenda.  
    * The agenda gets sent 1 hour before the meeting starts (google doc) via email and in the meeting channel  
* Sacrament meeting program  
  * Keep track of speakers, musical numbers,  
  * Create a sacrament meeting program that has the speakers, musical numbers, announcements, 2nd hour meeting.  
  * Announcements should be tracked as title, date/time, description and included in the bulletin until the date passes.  
  * Bishopric members should be able to ask the agent to add announcements to the record of announcements, or add them via slack command  
  * This should connect to a google sheet that has all the needed information with each week as a column. If any information is missing for the upcoming week, ask someone to provide it, optionally add it to the column in the google sheet.  
* Calling management   
  * From bishopric meeting notes make todos for extending callings, as part of completing a todo the bishop or counselor should mark if they accepted, if they do then add to business items for sacrament meeting, otherwise add to next bishopric meeting agenda that someone else needs to be called. Bishopric member should be informed once they give a response if they say the person didn’t accept it will go on the bishopric meeting agenda.  
  * Ask bishopric member if they should be sustained in sacrament meeting or only announced.  
  * They should be added to the sacrament meeting business items to announce/sustain  
  * Some callings we don’t sustain only announce.  
  * They go on a list of people to set apart and bishopric is made aware  
  * 1 hour after church bishopric gets a checkbox list to indicate who was set apart  
  * Clerk is notified to update calling in LCR and that they have been set apart.  
* Track todo items  
  * Allow me to enter todo items during meeting notes with an assignee (not always a person in slack) and an end date  
  * Follow up with that person half way to the end date, to remind them. and then one day before ask for a report of the status of that todo item. If the todo item was part of a meeting, then the message to ask if they have any items to add to the agenda should also ask for a reporting on their todo item(s)  
  * If a todo item is made during a meeting without and end date, the end date should be the next meeting of that type of meeting (youth council, ward council, bishopric, etc.)

Other behavior to consider 

* Document management  
  * The bot should create a drive folder, or allow one to be specified that will hold all the applicable documents  
  * A folder for each meeting with the current agenda and an archive folder for old agendas. Once a new agenda is finalized the previous one is moved to the archive folder.  
  * A folder for sacrament meeting, which holds the business items and the sacrament meeting programs  
    * A google sheet for keeping track of who the speakers are, musical numbers, prayers, etc.  
    * Business items is for the counselor who is directing to know what to say when conducting the meeting, should have the items from the program as well as the callings, announcement, ward and stake business.there should be a folder for archiving business items  
    * Sacrament meeting program, should have the date, hymns/ musical numbers, speakers or state it is fast and testimony meeting, second hour meeting, announcements. Archive folder for old programs, current program inside folder.  
* Channels for the bot to use include a bishopric channel (clerks, secretaries, counselors and the bishop), clerk channel (clerk \+ assistant clerks), executive secretary channel (executive secretary, assistant executive secretaries), and a channel for each recurring meeting such as ward council or youth council.  
* Slack integration app home should provide an interface for specifying the emails of organization leaders