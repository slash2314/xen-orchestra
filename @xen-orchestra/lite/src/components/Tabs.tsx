import React from 'react'
import { withState } from 'reaclette'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'

interface ParentState {}

interface State {
  value: string
}

interface TabType {
  id: string
  label: React.ReactNode
  component?: React.ReactNode
}

interface Props {
  // list= [
  //   {
  //      id: 'idA',
  //      label: (
  //        <span>
  //          <Icon icon='cloud' /> {labelA}
  //        </span>
  //      ),
  //      component: (<div>{contentA}</div>)
  //   },
  // ]
  list: Array<TabType>
}

interface ParentEffects {}

interface Effects {
  onChange: (event: React.SyntheticEvent, value: string) => void
}

interface Computed {}

const Tabs = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    initialState: ({ list }) => ({ value: list[0].id }),
    effects: {
      onChange: function (event, value) {
        this.state.value = value
      },
    },
  },
  ({ effects, state: { value }, list }) => {
    const pageUnderConstruction = (
      <div style={{ color: '#0085FF', textAlign: 'center' }}>
        <h2>XOLite is under construction</h2>
        <h3>New features are coming soon !</h3>
      </div>
    )

    return (
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', background: '#FFFFFF', marginTop: '0.5em' }}>
          <TabList onChange={effects.onChange} /*aria-label='lab API tabs example'*/>
            {list.map((tab: TabType) => (
              <Tab key={tab.id} label={tab.label} value={tab.id} />
            ))}
          </TabList>
        </Box>
        {list.map((tab: TabType) => (
          <TabPanel key={tab.id} value={tab.id}>
            {tab.component === undefined ? pageUnderConstruction : tab.component}
          </TabPanel>
        ))}
      </TabContext>
    )
  }
)

export default Tabs
